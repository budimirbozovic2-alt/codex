// ─────────────────────────────────────────────────────────────────────────────
// PR-E4 — Pure TanStack re-export barrel.
//
// Historical Zustand-backed `*Ram` selectors (and the `cardMapStore` they
// closed over) were deleted as part of the Dual-State removal. TanStack
// Query is now the single in-memory store for cards; every consumer reads
// through these scoped hooks, invalidated by the `onCardsChanged` bridge.
// ─────────────────────────────────────────────────────────────────────────────
export {
  useCardsByCategory,
  useCardsByCategoryWithStatus,
  useCardsBySubcategory,
  useCardsByChapter,
  useCardCountByCategory,
  useCardCountsByCategoryMap,
  useCardById,
  useCardsBySource,
} from "@/hooks/card/useCardsQuery";
