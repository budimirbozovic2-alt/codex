/**
 * Public API barrel for the `cards` domain.
 *
 * All external callers (hooks, contexts, components, services) MUST import
 * from `@/domains/cards` — deep imports into sibling files are blocked by
 * ESLint wall W11 outside `src/domains/cards/**`.
 *
 * Composition:
 *   • Sync RAM-commit primitives over the Zustand `cardMapStore` live here
 *     in `cardMapWrites.ts` (the post-B1 collapse target).
 *   • Async write wrappers + optimistic UI use `useCardMutations` (hooks).
 *   • Read path uses TanStack Query bridges over `@/lib/db/queries.cards*`.
 *
 * Infra (db, persistence, sr/FSRS, logger, persist-queue) stays under
 * `@/lib/*` — this barrel re-exports nothing infra-level.
 */
export * from "./cardMapWrites";
