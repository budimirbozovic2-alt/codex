// ─────────────────────────────────────────────────────────────────────────────
// Phase 5A — Category Repository facade.
//
// Mirrors `cardRepository` for the category aggregate. Until Step B/C, the
// React-side `CategoryStateProvider` is still authoritative for in-memory
// reads — this facade focuses on the **write contract**:
//
//   1) Funnel every IDB write through one place (`idbSaveCategories`).
//   2) Emit `CATEGORIES_UPDATED` on every commit, tagged with the source, so
//      the `categoryStateInvalidator` can refresh RAM when the write came
//      from outside the optimistic path (backup restore, electron import,
//      future remote sync).
//
// External callers tag themselves (`"backup-restore"`, `"cascade-delete"`,
// …) and the invalidator does a single `idbLoadCategories` → setter call.
// Our own optimistic writes use `source: "repository"` and the invalidator
// skips them because RAM was already mutated inline.
// ─────────────────────────────────────────────────────────────────────────────
import type { CategoryRecord } from "@/lib/db";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";

export type CategoriesUpdatedSource =
  | "repository"
  | "repository-replace"
  | string; // external — backup-restore, cascade-delete, normalize, …

export interface CategoriesUpdatedPayload {
  source: CategoriesUpdatedSource;
  categoryIds?: string[];
  deletedIds?: string[];
}

export function emitCategoriesUpdated(payload: CategoriesUpdatedPayload): void {
  try { eventBus.emit(EVENT_TYPES.CATEGORIES_UPDATED, payload); }
  catch { /* bus failures must not break a commit */ }
}

export const categoryRepository = {
  emit: emitCategoriesUpdated,
};
