// Seed default categories via `queries/categories`. Called from `loadInitialData`.
import type { CategoryRecord } from "./db-types";
import {
  listAllCategories,
  bulkPutCategories,
} from "./db/queries";
import { logger } from "@/lib/logger";

// ─── Default Categories ─────────────────────────────────

export const DEFAULT_CATEGORIES: { name: string; color?: string }[] = [
  { name: "Krivično materijalno pravo", color: "hsl(0, 70%, 50%)" },
  { name: "Krivično procesno pravo", color: "hsl(20, 70%, 50%)" },
  { name: "Građansko materijalno pravo", color: "hsl(210, 70%, 50%)" },
  { name: "Građansko procesno pravo", color: "hsl(180, 70%, 50%)" },
  { name: "Upravno pravo", color: "hsl(270, 70%, 50%)" },
  { name: "Privredno pravo", color: "hsl(150, 70%, 50%)" },
  { name: "Radno pravo", color: "hsl(45, 70%, 50%)" },
  { name: "Ustavno pravo i organizacija pravosuđa", color: "hsl(300, 70%, 50%)" },
  { name: "Konvencijsko pravo", color: "hsl(330, 70%, 50%)" },
];

export function createDefaultCategories(): CategoryRecord[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    id: crypto.randomUUID(),
    name: c.name,
    sortOrder: i,
    subcategories: [],
    color: c.color,
  }));
}

/**
 * Load all categories from SQLite. Seeds defaults only on a virgin install
 * (empty table). Returns the in-memory snapshot the boot loader pushes into
 * the Zustand `categoryStore`.
 */
export async function seedDefaultCategories(): Promise<CategoryRecord[]> {
  const existing = await listAllCategories();
  if (existing.length > 0) return existing;
  const defaults = createDefaultCategories();
  // Re-throw on failure so the boot caller surfaces it to the recovery UI
  // instead of silently seeding new UUIDs (which would orphan existing cards).
  await bulkPutCategories(defaults);
  if (import.meta.env.DEV) {
    logger.log(`[seed] Inserted ${defaults.length} default categories`);
  }
  return defaults;
}

// ─── Migration: cleanup legacy localStorage flags ──────
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    localStorage.removeItem("idb-migrated-v1");
    localStorage.removeItem("idb-migrated-v2");
    localStorage.removeItem("codex-source-registry");
    localStorage.removeItem("codex-monument-types");
  } catch (e) {
    logger.warn("[db-seed] legacy localStorage cleanup skipped", e);
  }
}
