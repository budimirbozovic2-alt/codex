/**
 * Source Reader heading navigation — keeps sidebar outline IDs in sync with the
 * live ProseMirror DOM (TipTap does not persist `id` attrs on headings).
 */
import type { Source } from "@/lib/db-types";
import { extractOutline } from "@/domains/sources/sources-storage";
import { docToHtml, type EditorDoc } from "@/lib/editor-v4";

export type SourceOutlineEntry = Source["outline"][number];

export const SOURCE_HEADING_SELECTOR = "h1, h2, h3, h4";
export const SOURCE_CONTENT_ROOT = ".source-content-host .ProseMirror";

export function headingIdForIndex(index: number): string {
  return `src-heading-${index}`;
}

/** Same outline shape as persisted HTML pipeline, derived from live AST. */
export function extractOutlineFromDoc(doc: EditorDoc): SourceOutlineEntry[] {
  return extractOutline(docToHtml(doc));
}

/** Assign stable `src-heading-N` ids on rendered heading nodes. */
export function syncHeadingDomIds(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(SOURCE_HEADING_SELECTOR).forEach((h, i) => {
    h.id = headingIdForIndex(i);
  });
}

/** Resolve a sidebar outline id to the matching heading inside the editor. */
export function resolveHeadingElement(
  root: ParentNode,
  id: string,
): HTMLElement | null {
  const escaped = typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(id)
    : id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  const byId = root.querySelector<HTMLElement>(`#${escaped}`);
  if (byId) return byId;

  const match = /^src-heading-(\d+)$/.exec(id);
  if (!match) return null;
  const headings = root.querySelectorAll<HTMLElement>(SOURCE_HEADING_SELECTOR);
  return headings[Number(match[1])] ?? null;
}

export function scrollToHeadingInEditor(id: string): boolean {
  const root = document.querySelector(SOURCE_CONTENT_ROOT);
  if (!root) return false;
  const el = resolveHeadingElement(root, id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}
