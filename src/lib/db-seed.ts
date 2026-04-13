import { db, type CategoryRecord } from "./db-schema";

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
 * Seed default categories if the table is empty.
 */
export async function seedDefaultCategories(): Promise<CategoryRecord[]> {
  const count = await db.categories.count();
  if (count > 0) {
    return db.categories.orderBy("sortOrder").toArray();
  }
  const defaults = createDefaultCategories();
  await db.categories.bulkPut(defaults);
  if (import.meta.env.DEV) console.log(`[MemoriaDB] Seeded ${defaults.length} default categories`);
  return defaults;
}

// ─── Migration: no-op for v7 (clean slate) ─────────────
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    localStorage.removeItem("idb-migrated-v1");
    localStorage.removeItem("idb-migrated-v2");
    localStorage.removeItem("codex-source-registry");
    localStorage.removeItem("codex-monument-types");
  } catch { /* ignore */ }
}
