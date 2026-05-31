/**
 * Thin wrapper used by `useDraftAutosave({ persistDraft: true })`.
 *
 * Delegates to the SQLite-backed drafts repo at `@/lib/db/queries`. Dexie
 * has been removed (Phase C) — this barrel exists only for legacy import
 * paths so the autosave hot path stays unchanged.
 */
export {
  putDraft,
  getDraft,
  deleteDraft,
  listDraftsBySource,
} from "@/lib/db/queries";
