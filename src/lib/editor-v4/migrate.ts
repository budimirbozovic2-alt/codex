/**
 * editor-v4 migration engine — pure, idempotent dispatcher.
 *
 * Converts legacy HTML / markdown payloads into the canonical V4 `EditorDoc`
 * (ProseMirror JSON). Does NOT touch the DB. Used in:
 *
 *   1. Boot schema migration (`editor-v4-schema-migration.ts`) during SQLite open.
 *   2. Dry-run CLI (`src/scripts/migrate-editor-v4.ts`) — runs over a
 *      JSON backup file and emits a `{migrated, failed, samplesWithDataLoss}`
 *      report. Test fixtures assert zero data loss for wiki/mindmap/keyParts.
 *
 * Idempotency contract: a record whose `contentDoc.version === 4` is returned
 * unchanged with `changed: false`. Re-running the dispatcher over the output
 * of a previous run is a no-op.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { Source, KnowledgeBaseArticle } from "@/lib/db-types";
import type { EditorDoc, JSONContent } from "./types";
import { htmlToDoc } from "./codecs/html-to-doc";
import { MINDMAP_RE } from "./patterns";
import { WIKI_LINK_RE } from "@/lib/zettelkasten-wiki-link";

export interface MigrateResult<T> {
  readonly record: T;
  readonly changed: boolean;
  readonly warnings: readonly string[];
}

// ─── Semantic token counters ──────────────────────────────────────────────
// Zero-tolerance invariant: every wiki-link, mindmap embed and key-part mark
// in the input HTML/markdown must survive the round-trip into the EditorDoc.
// Mismatches are surfaced as warnings → the CLI reports them as
// `samplesWithDataLoss` and the test asserts `length === 0`.

interface TokenCounts {
  readonly wikiLinks: number;
  readonly mindmap: number;
  readonly keyParts: number;
}

function countSourceTokens(text: string): TokenCounts {
  const wiki = new RegExp(WIKI_LINK_RE.source, "g");
  const mm = new RegExp(MINDMAP_RE.source, "g");
  // `<mark class="key-part-highlight">` (preferred) OR `<mark data-key-part>`.
  const keyPartRe = /<mark[^>]*(?:class="[^"]*key-part-highlight|data-key-part)/gi;
  return {
    wikiLinks: (text.match(wiki) ?? []).length,
    mindmap: (text.match(mm) ?? []).length,
    keyParts: (text.match(keyPartRe) ?? []).length,
  };
}

function countDocTokens(doc: EditorDoc): TokenCounts {
  let wikiLinks = 0;
  let mindmap = 0;
  let keyParts = 0;
  const visit = (node: JSONContent): void => {
    if (!node) return;
    if (node.type === "wikiLink") wikiLinks++;
    else if (node.type === "mindmapEmbed") mindmap++;
    const marks = node.marks ?? [];
    for (const m of marks) if (m.type === "keyPart") keyParts++;
    const kids = node.content ?? [];
    for (const k of kids) visit(k);
  };
  visit(doc.content);
  return { wikiLinks, mindmap, keyParts };
}

function diffTokens(label: string, src: TokenCounts, doc: TokenCounts): string[] {
  const w: string[] = [];
  if (src.wikiLinks !== doc.wikiLinks) {
    w.push(`${label}: wikiLinks ${src.wikiLinks} → ${doc.wikiLinks}`);
  }
  if (src.mindmap !== doc.mindmap) {
    w.push(`${label}: mindmap ${src.mindmap} → ${doc.mindmap}`);
  }
  if (src.keyParts !== doc.keyParts) {
    w.push(`${label}: keyParts ${src.keyParts} → ${doc.keyParts}`);
  }
  return w;
}

// ─── Minimal markdown → HTML (zettelkasten flavour) ───────────────────────
// Articles store markdown; their wiki/mindmap markers are identical to the
// HTML pipeline's markers (preprocessHtml handles them as text), so we only
// need to convert MD block syntax — headings, bold/italic, lists, code spans,
// paragraphs. Mirrors `renderMarkdown` in ZettelPreview (sans interactive
// wiki-link substitution, which `htmlToDoc` will perform downstream).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mdInline(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // E.3: tolerate single `*` inside bold (e.g. `**bold *italic* bold**`) by
  // matching any char that isn't `*`, or a `*` not followed by another `*`.
  s = s.replace(/\*\*((?:[^*]|\*(?!\*))+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}

/** Lightweight MD → HTML. Wiki/mindmap markers pass through (handled by preprocessHtml). */
export function mdToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let paraBuf: string[] = [];

  const flushPara = (): void => {
    if (paraBuf.length === 0) return;
    out.push(`<p>${mdInline(paraBuf.join(" "))}</p>`);
    paraBuf = [];
  };
  const closeList = (): void => {
    if (inList) { out.push("</ul>"); inList = false; }
  };

  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      flushPara();
      closeList();
      continue;
    }
    if (/^###\s+/.test(line)) {
      flushPara(); closeList();
      out.push(`<h3>${mdInline(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushPara(); closeList();
      out.push(`<h2>${mdInline(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      flushPara(); closeList();
      out.push(`<h1>${mdInline(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${mdInline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      continue;
    }
    paraBuf.push(line);
  }
  flushPara();
  closeList();
  return out.join("\n");
}

// ─── Public dispatcher ────────────────────────────────────────────────────

function isV4Doc(d: unknown): d is EditorDoc {
  return !!d && typeof d === "object" && (d as { version?: number }).version === 4
    && !!(d as { content?: unknown }).content;
}

function convertHtml(html: string, label: string): { doc: EditorDoc; warnings: string[] } {
  const doc = htmlToDoc(html);
  const srcTokens = countSourceTokens(html);
  const docTokens = countDocTokens(doc);
  const warnings = diffTokens(label, srcTokens, docTokens);
  return { doc, warnings };
}

export function migrateCard(card: Card): MigrateResult<Card> {
  let mutated = false;
  const warnings: string[] = [];
  const nextSections = card.sections.map((s) => {
    if (isV4Doc(s.contentDoc)) return s;
    const html = (s as { content?: string }).content ?? "";
    if (!html.trim()) {
      mutated = true;
      return { ...s, contentDoc: { version: 4 as const, content: { type: "doc", content: [] } satisfies JSONContent } };
    }
    const { doc, warnings: w } = convertHtml(html, `card[${card.id}].section[${s.id}]`);
    warnings.push(...w);
    mutated = true;
    return { ...s, contentDoc: doc };
  });
  if (!mutated) return { record: card, changed: false, warnings: [] };
  return { record: { ...card, sections: nextSections }, changed: true, warnings };
}

export function migrateSource(source: Source): MigrateResult<Source> {
  if (isV4Doc(source.contentDoc)) {
    return { record: source, changed: false, warnings: [] };
  }
  // Legacy DB rows may still carry `htmlContent` even though the runtime
  // type no longer exposes it — read it via a runtime cast.
  const html = (source as unknown as { htmlContent?: string }).htmlContent ?? "";
  if (!html.trim()) {
    return {
      record: { ...source, contentDoc: { version: 4, content: { type: "doc", content: [] } } },
      changed: true,
      warnings: [],
    };
  }
  const { doc, warnings } = convertHtml(html, `source[${source.id}]`);
  return { record: { ...source, contentDoc: doc }, changed: true, warnings };
}

export function migrateArticle(article: KnowledgeBaseArticle): MigrateResult<KnowledgeBaseArticle> {
  if (isV4Doc(article.contentDoc)) {
    return { record: article, changed: false, warnings: [] };
  }
  // Legacy DB rows may still carry `content` markdown — runtime cast.
  const md = (article as unknown as { content?: string }).content ?? "";
  if (!md.trim()) {
    return {
      record: { ...article, contentDoc: { version: 4, content: { type: "doc", content: [] } } },
      changed: true,
      warnings: [],
    };
  }
  // MD's wiki/mindmap markers are text-level — count them on the raw MD,
  // then convert MD → HTML and let htmlToDoc handle the rest.
  const srcTokens = countSourceTokens(md);
  const html = mdToHtml(md);
  const doc = htmlToDoc(html);
  const docTokens = countDocTokens(doc);
  const warnings = diffTokens(`article[${article.id}]`, srcTokens, docTokens);
  return { record: { ...article, contentDoc: doc }, changed: true, warnings };
}
