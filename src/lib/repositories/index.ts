// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel for `@/lib/repositories`.
//
// All external callers MUST import from this barrel. Deep imports are
// blocked by ESLint outside the `src/lib/repositories/**` boundary (see
// eslint.config.js — "Public API walls").
// ─────────────────────────────────────────────────────────────────────────────

export { cardRepository } from "./cardRepository";

export {
  categoryRepository,
  commit as commitCategoryRecords,
  getCategorySnapshot,
} from "./categoryRepository";

export { reviewLogRepository } from "./reviewLogRepository";
export { settingsRepository } from "./settingsRepository";
