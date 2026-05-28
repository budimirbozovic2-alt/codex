/**
 * Auto-Split Import Service — sole owner of side-effects for auto-split.
 *
 * Wraps `bulkAddCards` / `updateCard`, drains the persist queue, and verifies
 * the SQLite card count post-write. The hook only sees a clean Promise<ImportResult>.
 */
import { persistQueue } from "@/lib/persist-queue";
import { countCards } from "@/lib/db/queries";
import type { Card } from "@/lib/spaced-repetition";
import type { ImportPlan, CardUpdatePatch } from "@/lib/auto-split/import-planner";

export interface ExecuteDeps {
  bulkAddCards: (cards: Card[]) => void;
  updateCard: (id: string, patch: CardUpdatePatch) => void;
  onProgress?: (pct: number) => void;
}

export interface ImportResult {
  created: number;
  updated: number;
  total: number;
  idbCount: number;
}

export async function executeImportPlan(
  plan: ImportPlan,
  deps: ExecuteDeps,
): Promise<ImportResult> {
  deps.onProgress?.(10);
  if (plan.toCreate.length > 0) deps.bulkAddCards(plan.toCreate);
  for (const u of plan.toUpdate) deps.updateCard(u.id, u.patch);
  deps.onProgress?.(50);
  await persistQueue.flush();
  // A1c-4 F6: SQLite-primary count. Field name stays `idbCount` for backward
  // compat with the hook return shape; it now reflects the SQLite cards table.
  const idbCount = await countCards();
  deps.onProgress?.(100);
  return {
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
    total: plan.toCreate.length + plan.toUpdate.length,
    idbCount,
  };
}
