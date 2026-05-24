import { WIKI_LINK_RE } from "@/lib/zettelkasten-wiki-link";
import { escapeHtml } from "@/lib/sanitize";

/**
 * `::mindmap[<uuid>]` — block embed syntax. UUID-shaped id but we tolerate
 * any non-`]` payload of >=8 chars so legacy/test ids still match.
 */
export const MINDMAP_RE = /::mindmap\[([^\]\s]{8,})\]/g;

const SKIP_TAGS = new Set(["CODE", "PRE"]);

/**
 * Walks `html`'s text nodes and rewrites `[[wiki]]` / `::mindmap[id]` into
 * the data-attribute HTML shapes our TipTap schema parses. Skips `<code>`
 * and `<pre>` so authors can document the syntax literally.
 *
 * Pure function: returns transformed HTML, never mutates input. Requires
 * `document` (jsdom in tests, real DOM in app). When no DOM is available
 * the input is returned unchanged — the only consumer (htmlToDoc) also
 * requires DOM via `generateJSON`, so this is consistent.
 */
export function preprocessHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const tmpl = document.createElement("template");
  tmpl.innerHTML = html;
  walkText(tmpl.content);
  return tmpl.innerHTML;
}

function walkText(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p: HTMLElement | null = (node as Text).parentElement;
      while (p) {
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        p = p.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const pending: Array<{ node: Text; html: string }> = [];
  let cur = walker.nextNode() as Text | null;
  while (cur) {
    const txt = cur.nodeValue ?? "";
    if (hasMatch(txt)) pending.push({ node: cur, html: rewriteText(txt) });
    cur = walker.nextNode() as Text | null;
  }
  for (const { node, html } of pending) {
    const span = document.createElement("span");
    span.innerHTML = html;
    node.replaceWith(...Array.from(span.childNodes));
  }
}

function hasMatch(text: string): boolean {
  WIKI_LINK_RE.lastIndex = 0;
  MINDMAP_RE.lastIndex = 0;
  return WIKI_LINK_RE.test(text) || MINDMAP_RE.test(text);
}

interface Span {
  readonly start: number;
  readonly end: number;
  readonly html: string;
}

function rewriteText(text: string): string {
  const spans: Span[] = [];
  const wiki = new RegExp(WIKI_LINK_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = wiki.exec(text)) !== null) {
    const target = m[1].trim();
    if (!target) continue;
    const display = (m[2]?.trim()) || target;
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      html: `<a data-wikilink="${escapeHtml(target)}" data-display="${escapeHtml(display)}">${escapeHtml(display)}</a>`,
    });
  }
  const mm = new RegExp(MINDMAP_RE.source, "g");
  while ((m = mm.exec(text)) !== null) {
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      html: `<div data-mindmap="${escapeHtml(m[1])}"></div>`,
    });
  }
  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue; // overlap guard
    out += escapeHtml(text.slice(cursor, s.start)) + s.html;
    cursor = s.end;
  }
  out += escapeHtml(text.slice(cursor));
  return out;
}
