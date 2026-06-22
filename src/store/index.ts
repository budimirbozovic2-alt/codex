// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel for `@/store`.
// ─────────────────────────────────────────────────────────────────────────────

// ── Granular card selectors (TanStack-backed, single SSOT) ─────────────────
export {
  useCardsByCategory,
  useCardsByCategoryWithStatus,
  useCardCountsByCategoryMap,
  useCardById,
  useCardByIdWithStatus,
  useCardsBySource,
} from "./useCardSelectors";

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
