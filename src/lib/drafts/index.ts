/**
 * Public API barrel for `@/lib/drafts`.
 *
 * External callers MUST import from this barrel — deep imports like
 * `@/lib/drafts/draftRegistry` are blocked by ESLint outside `src/lib/drafts/**`
 * and the `src/hooks/useDraft*` family (see eslint.config.js).
 *
 * Hook surface lives in `@/hooks/useDraftRegistry` / `@/hooks/useDraftAutosave`
 * / `@/hooks/usePersistedDraftMirror` — those import this barrel internally.
 */
export { draftRegistry } from "./draftRegistry";
export { putDraft, getDraft, deleteDraft, listDraftsBySource } from "./draftsTable";
export { recoverDraftsOnBoot } from "./draftRecovery";
