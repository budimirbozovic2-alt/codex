// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel for `@/store`.
//
// External callers MUST import from this barrel. Deep imports like
// `@/store/useCardSelectors` are blocked by ESLint outside `src/store/**`
// (see eslint.config.js — "Public API walls"). Keeping a single entrypoint
// lets us split / merge selector files freely without churning consumers.
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
export type {
  CardMapRefFacade,
  CardMapSetter,
} from "./useCardMapStore";

// ── Granular card selectors (RAM + hybrid façade) ──────────────────────────
export {
  useCardsByCategory,
  useCardsBySubcategory,
  useCardsByChapter,
  useCardCountByCategory,
  useCardById,
  useCardsByCategoryRam,
  useCardsBySubcategoryRam,
  useCardsByChapterRam,
  useCardCountByCategoryRam,
  useCardByIdRam,
} from "./useCardSelectors";

/**
 * Dexie-backed selectors. Public so the hybrid façade above can route into
 * them when `USE_DB_LIVE_SELECTORS` is enabled. Prefer the un-suffixed hooks
 * for normal view code — they pick the right backend automatically.
 */
export {
  useCardsByCategoryFromDb,
  useCardsBySubcategoryFromDb,
  useCardsByChapterFromDb,
  useCardsBySourceFromDb,
  useCardCountByCategoryFromDb,
  useCardByIdFromDb,
} from "./useCardSelectorsFromDb";

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
export type {
  ReaderWidth,
  SelectionState,
  HeadingMenuState,
  SplitResultState,
} from "./useSourceReaderStore";
