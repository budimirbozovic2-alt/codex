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

// ── Phase 6 — Branded ID types + edge converters ───────────────────────────
// Re-exported through the `@/store` barrel so view / hook code that already
// consumes selectors can pick up the brand machinery without reaching into
// `@/lib/ids` directly. Converters are runtime no-ops outside of DEV.
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
export type {
  CategoryId,
  SubcategoryId,
  ChapterId,
  CardId,
  SourceId,
  CategoryIdLike,
  SubcategoryIdLike,
  ChapterIdLike,
  CardIdLike,
  SourceIdLike,
} from "@/lib/ids";
