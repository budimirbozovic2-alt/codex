// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel for `@/lib/repositories`.
//
// All external callers MUST import from this barrel. Deep imports are
// blocked by ESLint outside the `src/lib/repositories/**` boundary (see
// eslint.config.js — "Public API walls").
// ─────────────────────────────────────────────────────────────────────────────

export { cardRepository } from "./cardRepository";
export type { ChapterFieldUpdate } from "./cardRepository";

export {
  categoryRepository,
} from "./categoryRepository";

export { reviewLogRepository } from "./reviewLogRepository";
export { settingsRepository } from "./settingsRepository";
