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

// ── Granular card selectors (TanStack-backed, single SSOT) ─────────────────
export {
  useCardsByCategory,
  useCardsByCategoryWithStatus,
  useCardCountsByCategoryMap,
  useCardById,
  useCardsBySource,
} from "./useCardSelectors";

// ── Category store ───────────────────────────────────────────────────────────
export {
  categoryStore,
  getCategoryStoreRecords,
} from "./useCategoryStore";

// ── Source reader store ────────────────────────────────────────────────────
export {
  useSourceReaderStore,
  WIDTH_CLASSES,
  READER_FONT_SIZE_CLASS,
  READER_LINE_HEIGHT_VALUE,
  READER_FONT_SIZE_LABELS,
  READER_LINE_HEIGHT_LABELS,
} from "./useSourceReaderStore";
export type { ReaderWidth, ReaderFontSize, ReaderLineHeight } from "./useSourceReaderStore";
