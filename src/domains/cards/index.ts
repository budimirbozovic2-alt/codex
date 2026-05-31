/**
 * Public API barrel for the `cards` domain.
 *
 * Post PR-E4 the domain owns nothing in-RAM. The legacy `cardMapWrites`
 * sync RAM-commit module + Zustand `cardMapStore` have been deleted; all
 * card writes flow through `@/lib/db/queries` (`putCardDirect`,
 * `bulkPutCardsDirect`, `deleteCardDirect`, …) and reads flow through
 * TanStack Query hooks in `@/hooks/card/useCardsQuery`.
 *
 * This barrel is intentionally empty — kept so the ESLint W11 wall
 * (no deep imports into `src/domains/cards/**`) still has a sanctioned
 * seam should the domain re-grow public surface area in the future.
 */
export {};
