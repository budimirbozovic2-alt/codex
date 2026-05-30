// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel for `@/store`.
//
// External callers MUST import from this barrel. Deep imports like
// `@/store/useCardSelectors` are blocked by ESLint outside `src/store/**`
// (see eslint.config.js — "Public API walls"). Keeping a single entrypoint
// lets us split / merge selector files freely without churning consumers.
//
// Cleanup note: type re-exports were pruned (knip pass). Branded ID *types*
// (`CategoryId`, `*IdLike`, etc.) and store-shape interfaces
// (`SelectionState`, `CardMapRefFacade`, …) are now imported directly from
// `@/lib/ids` / their owning store module by the few consumers that need
// them. If a new external consumer appears, re-add the specific type here.
// ─────────────────────────────────────────────────────────────────────────────

// ── Card map store (Zustand atom + ref facade) ─────────────────────────────
export {
  cardMapStore,
  useCardMap,
  useCardsArray,
  getCardMap,
  replaceCardMap,
  setCardMap,
  cardMapRefFacade,
} from "./useCardMapStore";

// ── Granular card selectors (TanStack-backed) ──────────────────────────────
// Note: `*Ram` variants live in `./useCardSelectors` and are test-only.
// They are NOT re-exported here — production code must use the TanStack
// path (event-invalidated via `onCardsChanged` bridge). ESLint W9 enforces
// this wall (see eslint.config.js).
export {
  useCardsByCategory,
  useCardsByCategoryWithStatus,
  useCardsBySubcategory,
  useCardsByChapter,
  useCardCountByCategory,
  useCardById,
} from "./useCardSelectors";

export { useCardsBySource } from "./useCardsBySource";


// ── Category store + selectors ─────────────────────────────────────────────
export {
  useCategory,
  useSubcategoriesByParent,
  useChaptersBySubcategory,
} from "./useCategorySelectors";

export {
  categoryStore,
  setCategoryStoreRecords,
  getCategoryStoreRecords,
  useCategoryFromStore,
  useSubcategoriesByParentFromStore,
  useChaptersBySubcategoryFromStore,
  useAllCategoryRecordsFromStore,
} from "./useCategoryStore";

// ── Source reader store ────────────────────────────────────────────────────
export { useSourceReaderStore, WIDTH_CLASSES } from "./useSourceReaderStore";
export type { ReaderWidth } from "./useSourceReaderStore";

// ── Phase 6 — Branded ID runtime helpers ───────────────────────────────────
// Re-exported through the `@/store` barrel so view / hook code that already
// consumes selectors can pick up the brand machinery without reaching into
// `@/lib/ids` directly. Converters are runtime no-ops outside of DEV.
// Type aliases (`CategoryId`, `*IdLike`, …) are imported from `@/lib/ids`
// directly by store internals — no consumers need them through this barrel.
export {
  asCategoryId,
  asSubcategoryId,
  asChapterId,
  asCardId,
  asSourceId,
  isCategoryId,
  isSubcategoryId,
  isChapterId,
  isCardId,
  isSourceId,
  isUuidLike,
} from "@/lib/ids";
