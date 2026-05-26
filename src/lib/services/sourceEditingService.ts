/**
 * Source Editing Service — sole owner of source persistence + planner side-effects
 * for the source-reader flows.
 */
import { saveSource, type Source } from "@/lib/sources-storage";
import { incrementDailyMapped } from "@/lib/planner-storage";
import { autoFormatArticles } from "@/lib/article-autoformat";
import { rebuildSourceFromHtml } from "@/lib/source-reader/source-html-pipeline";
import { docToHtml, type EditorDoc } from "@/lib/editor-v4";

export async function persistSourceHtml(
  source: Source,
  rawHtml: string,
  onSourceUpdated?: (s: Source) => void,
): Promise<Source> {
  const updated = rebuildSourceFromHtml(source, rawHtml);
  await saveSource(updated);
  onSourceUpdated?.(updated);
  return updated;
}

/**
 * Persist the V4 AST as the canonical `contentDoc` and derive `htmlContent`
 * via `docToHtml`. Outline / articles get rebuilt from the derived HTML.
 *
 * This is the write path used by `<EditorV4>` in-place editing — the AST is
 * SSOT and HTML is a derivative kept for legacy readers (search, exports).
 */
export async function persistSourceDoc(
  source: Source,
  doc: EditorDoc,
  onSourceUpdated?: (s: Source) => void,
): Promise<Source> {
  const html = docToHtml(doc);
  const rebuilt = rebuildSourceFromHtml(source, html);
  const updated: Source = { ...rebuilt, contentDoc: doc };
  await saveSource(updated);
  onSourceUpdated?.(updated);
  return updated;
}

export async function persistAutoFormat(
  source: Source,
  onSourceUpdated?: (s: Source) => void,
): Promise<{ count: number; source: Source | null }> {
  // PR-7c (M3 #5): derive HTML from canonical contentDoc — legacy htmlContent
  // is dropped post-v22.
  const baseHtml = docToHtml(source.contentDoc);
  const result = autoFormatArticles(baseHtml);
  if (result.count === 0) return { count: 0, source: null };
  const updated = await persistSourceHtml(source, result.html, onSourceUpdated);
  return { count: result.count, source: updated };
}

/** Notify planner + global listeners that N new mappings were committed. */
export function commitMappingCreated(count: number): void {
  if (count <= 0) return;
  incrementDailyMapped(count);
  window.dispatchEvent(new CustomEvent("codex-mapping-created"));
}
