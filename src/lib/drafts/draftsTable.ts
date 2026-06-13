/**
 * Thin wrapper used by `useDraftAutosave({ persistDraft: true })`.
 *
 * Delegates to the SQLite-backed drafts repo at `@/lib/db/queries`.
 */
export {
  putDraft,
  getDraft,
  deleteDraft,
} from "@/lib/db/queries";
