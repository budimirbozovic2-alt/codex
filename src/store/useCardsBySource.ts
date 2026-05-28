// ─────────────────────────────────────────────────────────────────────────────
// Phase 2a — TanStack-backed. The Zustand implementation has been retired
// from the UI path; the canonical hook lives in `@/hooks/card/useCardsQuery`
// and reads `cardsBySource(sourceId)` from the SQLite layer with
// event-driven invalidation via the `onCardsChanged` query bridge.
//
// Re-export preserved so existing `@/store` consumers keep compiling.
// ─────────────────────────────────────────────────────────────────────────────
export { useCardsBySource } from "@/hooks/card/useCardsQuery";
