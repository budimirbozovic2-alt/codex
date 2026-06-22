import { getBootState } from "@/lib/boot";
import { seedReaderFixture } from "./seed-reader-fixture";
import { seedPersistenceFixture } from "./seed-persistence-fixture";
import { simulateE2ESessionRestart } from "./session-restart";
import { countAllCards, listAllCards, listAllCategories } from "@/lib/db/queries";
import {
  getCardsHydrated,
} from "@/lib/query/cards-cache-coordinator";
import {
  getCategoriesHydrated,
} from "@/lib/query/categories-cache-coordinator";

const autosaveFlushers = new Set<() => void>();

export function registerE2EAutosaveFlush(fn: () => void): () => void {
  autosaveFlushers.add(fn);
  return () => {
    autosaveFlushers.delete(fn);
  };
}

function flushSourceAutosave(): void {
  for (const fn of autosaveFlushers) {
    try {
      fn();
    } catch {
      /* E2E flush is best-effort */
    }
  }
}

export interface CodexE2EBridge {
  waitForReady: (timeoutMs?: number) => Promise<void>;
  seedReaderFixture: () => Promise<{ categoryId: string; sourceId: string; skriptaSourceId: string }>;
  seedPersistenceFixture: () => Promise<{ categoryId: string; cardId: string; cardQuestion: string }>;
  simulateSessionRestart: () => Promise<void>;
  getCardCount: () => Promise<number>;
  listCardIds: () => Promise<string[]>;
  listCategoryIds: () => Promise<string[]>;
  getPersistenceSnapshot: () => Promise<{
    cardIds: string[];
    categoryIds: string[];
    cardsHydrated: boolean;
    categoriesHydrated: boolean;
  }>;
  flushSourceAutosave: () => void;
}

declare global {
  interface Window {
    __codexE2E?: CodexE2EBridge;
  }
}

async function waitForReady(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (getBootState().type === "ready") return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Boot did not reach ready within ${timeoutMs}ms`);
}

/** Expose deterministic DB seed + boot helpers for Playwright. */
export function installE2EBridge(): void {
  window.__codexE2E = {
    waitForReady,
    seedReaderFixture,
    seedPersistenceFixture,
    simulateSessionRestart: simulateE2ESessionRestart,
    getCardCount: countAllCards,
    listCardIds: async () => (await listAllCards()).map((c) => c.id),
    listCategoryIds: async () => (await listAllCategories()).map((c) => c.id),
    getPersistenceSnapshot: async () => ({
      cardIds: (await listAllCards()).map((c) => c.id),
      categoryIds: (await listAllCategories()).map((c) => c.id),
      cardsHydrated: getCardsHydrated(),
      categoriesHydrated: getCategoriesHydrated(),
    }),
    flushSourceAutosave,
  };
}
