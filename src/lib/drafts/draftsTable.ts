/**
 * Thin wrapper over the Dexie `drafts` table used by
 * `useDraftAutosave({ persistDraft: true })`. Keeps Dexie out of React code
 * and centralizes the "fire-and-forget on hot path" error handling.
 *
 * All functions swallow IDB errors after logging — autosave must never throw
 * into the React tree.
 */
import { db, type DraftRecord } from "@/lib/db-schema";
import { logger } from "@/lib/logger";

export async function putDraft(record: DraftRecord): Promise<void> {
  try {
    await db.drafts.put(record);
  } catch (err) {
    logger.warn("[drafts] put failed", { key: record.key, err });
  }
}

export async function getDraft(key: string): Promise<DraftRecord | undefined> {
  try {
    return await db.drafts.get(key);
  } catch (err) {
    logger.warn("[drafts] get failed", { key, err });
    return undefined;
  }
}

export async function deleteDraft(key: string): Promise<void> {
  try {
    await db.drafts.delete(key);
  } catch (err) {
    logger.warn("[drafts] delete failed", { key, err });
  }
}

export async function listDraftsBySource(source: string): Promise<DraftRecord[]> {
  try {
    return await db.drafts.where("source").equals(source).toArray();
  } catch (err) {
    logger.warn("[drafts] list failed", { source, err });
    return [];
  }
}
