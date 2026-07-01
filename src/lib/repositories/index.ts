// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel for `@/lib/repositories`.
//
// All external callers MUST import from this barrel. Deep imports are
// blocked by ESLint outside the `src/lib/repositories/**` boundary.
//
// Card writes: `cardRepository` is the sole public write API for cards.
// Reads remain in `@/lib/db/queries`.
// ─────────────────────────────────────────────────────────────────────────────

export { cardRepository } from "./cardRepository";
export type { ChapterFieldUpdate } from "./cardRepository";

export {
  categoryRepository,
} from "./categoryRepository";

export { reviewLogRepository } from "./reviewLogRepository";
export { settingsRepository } from "./settingsRepository";
