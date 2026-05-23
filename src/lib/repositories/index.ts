// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel for `@/lib/repositories`.
//
// All external callers MUST import from this barrel. Deep imports like
// `@/lib/repositories/cardRepository` are blocked by ESLint outside the
// `src/lib/repositories/**` boundary (see eslint.config.js — "Public API
// walls"). This keeps the surface area auditable as the IDB-as-SSOT
// migration progresses and makes it cheap to evolve repository internals
// without grepping the whole codebase.
// ─────────────────────────────────────────────────────────────────────────────

export { cardRepository } from "./cardRepository";
export type {
  CardsUpdatedPayload,
  CardsUpdatedSource,
} from "./cardRepository";

export {
  categoryRepository,
  emitCategoriesUpdated,
  commit as commitCategoryRecords,
  getCategorySnapshot,
} from "./categoryRepository";
export type {
  CategoriesUpdatedPayload,
  CategoriesUpdatedSource,
} from "./categoryRepository";

export { reviewLogRepository } from "./reviewLogRepository";
export { settingsRepository } from "./settingsRepository";

// Lifecycle-only — boot wires these into the React tree. Not for view code.
export {
  initCardMapInvalidator,
} from "./cardMapInvalidator";
export {
  initCategoryStateInvalidator,
  registerCategoryStateSetter,
} from "./categoryStateInvalidator";
