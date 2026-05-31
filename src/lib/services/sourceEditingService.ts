/**
 * Source Editing Service — pure builders + (legacy) persistence helpers
 * for source-reader flows.
 *
 * PR-7f M3d: React callers should prefer the pure `buildSource*` helpers and
 * commit through `useSourceMutations().save` (which provides optimistic UI
 * + bridge invalidation). The `persistSource*` wrappers remain for
 * non-React callers (e.g. lazy migrations) that still want a one-shot
 * derive→save with a direct `onSourceUpdated` callback.
 */
import { saveSource, type Source } from "@/lib/sources-storage";
import { incrementDailyMapped } from "@/domains/planner";
import { autoFormatArticles } from "@/lib/article-autoformat";
import { rebuildSourceFromHtml } from "@/lib/source-reader/source-html-pipeline";
import { docToHtml, type EditorDoc } from "@/lib/editor-v4";

// ── Pure builders (no IO) ──────────────────────────────────

/** Derive a fully rebuilt Source from raw HTML (outline + articles refreshed). */
export function buildSourceFromHtml(source: Source, rawHtml: string): Source {
  return rebuildSourceFromHtml(source, rawHtml);
}

/**
 * Build a Source where the V4 AST is canonical and `htmlContent` is derived
 * via `docToHtml`. Outline / articles get rebuilt from that derived HTML.
 */
export function buildSourceFromDoc(source: Source, doc: EditorDoc): Source {
  const html = docToHtml(doc);
  const rebuilt = rebuildSourceFromHtml(source, html);
  return { ...rebuilt, contentDoc: doc };
}

/** Build an auto-formatted Source; returns `null` if there were no matches. */
export function buildAutoFormatSource(source: Source): { count: number; source: Source | null } {
  const baseHtml = docToHtml(source.contentDoc);
  const result = autoFormatArticles(baseHtml);
  if (result.count === 0) return { count: 0, source: null };
  return { count: result.count, source: buildSourceFromHtml(source, result.html) };
}

// ── Legacy persistence wrappers (non-React callers) ────────

async function persistOrThrow(s: Source): Promise<void> {
  const res = await saveSource(s);
  if (res.ok === true) return;
  throw new Error(`[sourceEditingService] persist failed: ${res.error.code}`);
}

export async function persistSourceHtml(
  source: Source,
  rawHtml: string,
  onSourceUpdated?: (s: Source) => void,
): Promise<Source> {
  const updated = buildSourceFromHtml(source, rawHtml);
  await persistOrThrow(updated);
  onSourceUpdated?.(updated);
  return updated;
}

export async function persistSourceDoc(
  source: Source,
  doc: EditorDoc,
  onSourceUpdated?: (s: Source) => void,
): Promise<Source> {
  const updated = buildSourceFromDoc(source, doc);
  await persistOrThrow(updated);
  onSourceUpdated?.(updated);
  return updated;
}

export async function persistAutoFormat(
  source: Source,
  onSourceUpdated?: (s: Source) => void,
): Promise<{ count: number; source: Source | null }> {
  const built = buildAutoFormatSource(source);
  if (!built.source) return built;
  await persistOrThrow(built.source);
  onSourceUpdated?.(built.source);
  return built;
}

/** Notify planner + global listeners that N new mappings were committed.
 *  PR-7f M3a: React callers should prefer `usePlannerMutations().incrementMapped`
 *  i proslijediti `{ skipPlanner: true }` da se planner ne udvostruči.
 */
export function commitMappingCreated(count: number, opts?: { skipPlanner?: boolean }): void {
  if (count <= 0) return;
  if (!opts?.skipPlanner) incrementDailyMapped(count);
  window.dispatchEvent(new CustomEvent("codex-mapping-created"));
}
