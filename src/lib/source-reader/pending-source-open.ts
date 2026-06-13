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

/** Read + clear the pending id and resolve it against the current source list. */
export function consumePendingSourceOpen<T extends { id: string }>(
  sources: readonly T[],
): T | undefined {
  const openId = sessionStorage.getItem(SR_OPEN_SOURCE_ID_KEY);
  if (!openId || sources.length === 0) return undefined;
  sessionStorage.removeItem(SR_OPEN_SOURCE_ID_KEY);
  return sources.find((s) => s.id === openId);
}
