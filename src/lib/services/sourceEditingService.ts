/**
 * Source Editing Service — pure builders for source-reader flows.
 *
 * PR-7f M3d: React callers should prefer the pure `buildSource*` helpers and
 * commit through `useSourceMutations().save` (which provides optimistic UI
 * + bridge invalidation).
 */
import type { Source } from "@/domains/sources/sources-storage";
import { incrementDailyMapped } from "@/domains/planner";
import { autoFormatArticles } from "@/lib/article-autoformat";
import { autoFormatLegalProvisions } from "@/lib/skripta-legal-autoformat";
import { rebuildSourceFromHtml } from "@/lib/source-reader/source-html-pipeline";
import { docToHtml, htmlToDoc, type EditorDoc } from "@/lib/editor-v4";

// ── Pure builders (no IO) ──────────────────────────────────

/**
 * Build a Source where the V4 AST is canonical. Outline / articles get rebuilt
 * from HTML derived via `docToHtml`.
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
  return { count: result.count, source: buildSourceFromDoc(source, htmlToDoc(result.html)) };
}

/** Wrap detected statutory excerpts in skripta sources (visual `legal-provision` blocks). */
export function buildAutoFormatLegalProvisionsSource(
  source: Source,
): { count: number; source: Source | null } {
  const baseHtml = docToHtml(source.contentDoc);
  const result = autoFormatLegalProvisions(baseHtml);
  if (result.count === 0) return { count: 0, source: null };
  return { count: result.count, source: buildSourceFromDoc(source, htmlToDoc(result.html)) };
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
