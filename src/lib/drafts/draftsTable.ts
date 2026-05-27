/**
 * Thin wrapper used by `useDraftAutosave({ persistDraft: true })`.
 *
 * PR-9 M3 cut-over: delegates to the SQLite-primary repo at
 * `@/lib/db/queries` (drafts). Repo handles SQLite write + Dexie mirror
 * + error swallowing. We re-export with the legacy names so the autosave
 * hot path stays unchanged.
 */
export {
  putDraft,
  getDraft,
  deleteDraft,
  listDraftsBySource,
} from "@/lib/db/queries";
