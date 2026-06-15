/** sessionStorage key + custom event for cross-surface source-reader deep links. */
export const SR_OPEN_SOURCE_ID_KEY = "sr-open-source-id";
export const SOURCE_READER_OPEN_EVENT = "codex-open-source-reader";

/** Queue a source to open in CategoryView's full-screen reader. */
export function queueSourceReaderOpen(sourceId: string): void {
  sessionStorage.setItem(SR_OPEN_SOURCE_ID_KEY, sourceId);
  window.dispatchEvent(
    new CustomEvent(SOURCE_READER_OPEN_EVENT, { detail: { sourceId } }),
  );
}

export interface PendingSourceOpenResult<T extends { id: string }> {
  source?: T;
  /** Set when the pending id was cleared but no matching source exists. */
  missedId?: string;
}

/** Read + clear the pending id and resolve it against the current source list. */
export function consumePendingSourceOpen<T extends { id: string }>(
  sources: readonly T[],
): PendingSourceOpenResult<T> {
  const openId = sessionStorage.getItem(SR_OPEN_SOURCE_ID_KEY);
  if (!openId) return {};
  if (sources.length === 0) return {};
  sessionStorage.removeItem(SR_OPEN_SOURCE_ID_KEY);
  const found = sources.find((s) => s.id === openId);
  if (found) return { source: found };
  return { missedId: openId };
}
