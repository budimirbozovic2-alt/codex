// ─────────────────────────────────────────────────────────────────────────────
// Pure TanStack re-export barrel (PR-E).
//
// TanStack Query is the single in-memory store for cards. Every consumer
// reads through these scoped hooks, invalidated by the `onCardsChanged`
// bridge after each SQLite write.
// ─────────────────────────────────────────────────────────────────────────────
export {
  useCardsByCategory,
  useCardsByCategoryWithStatus,
  useCardCountsByCategoryMap,
  useCardById,
  useCardByIdWithStatus,
  useCardsBySource,
} from "@/hooks/card/useCardsQuery";
