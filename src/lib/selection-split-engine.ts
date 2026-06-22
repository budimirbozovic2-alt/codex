/**
 * Selection Smart-Split Engine
 * Parses selected text from a source for Član boundaries,
 * creates parent-child essay structure automatically.
 */
import { docToHtml, htmlToDoc, type EditorDoc, type JSONContent } from "@/lib/editor-v4";
import { newUuid } from "@/lib/ids";

export interface SelectionModule {
  /** Stable identity for React keys and editor remount after structural edits. */
  id: string;
  /** Bumped when `contentHtml` is replaced externally (e.g. manual cut). */
  editorRevision?: number;
  /** e.g. "59" */
  articleNum: string;
  /** Title: "čl. 59 Pojam podnesaka" */
  title: string;
  /** Raw content text of this article */
  contentText: string;
  /** HTML content (wrapped in <p> tags) */
  contentHtml: string;
  /** Canonical V4 AST when available (preserves lists, legal-provision, etc.) */
  contentDoc?: EditorDoc;
  /** Plain snippet for backlink */
  plainSnippet: string;
}

export interface SelectionSplitResult {
  /** Whether the selection contains multiple articles */
  hasArticles: boolean;
  /** The detected modules */
  modules: SelectionModule[];
  /** Summary label: "čl. 59 - čl. 71" */
  rangeLabel: string;
  /** Suggested parent essay name */
  parentName: string;
}

const ARTICLE_REGEX = /^(?:Č|č)(?:lan|LANAK|L(?:AN|ANAK)?\.?)\s+(\d+[a-z]?)\.?\s*$/i;
/** Detect lines that look like HTML headings in plain text (from stripped h1-h3) */
const HEADING_LINE_REGEX = /^#{1,3}\s+/;

const STRUCTURAL_KEYWORDS = /^\s*(DIO|GLAVA|POGLAVLJE|ODJELJAK|CZĘŚĆ|TYTUŁ)\b/i;

/** Detect structural legal headings that should be excluded from card body */
function isStructuralLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (trimmed.length <= 80 && trimmed === trimmed.toUpperCase() && /[A-ZČĆŽŠĐ]/.test(trimmed)) return true;
  if (STRUCTURAL_KEYWORDS.test(trimmed)) return true;
  return false;
}

/** Extract first N words from text for fallback title */
export function firstWords(text: string, n = 7): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return "";
  const slice = words.slice(0, n).join(" ");
  return words.length > n ? slice + "..." : slice;
}

function normalizePlain(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Remove first N words from text; returns remainder. */
export function stripWordPrefix(text: string, wordCount: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= wordCount) return "";
  return words.slice(wordCount).join(" ");
}

function stripPlainPrefix(content: string, titleNorm: string, titleMatch: string): string {
  if (content.toLowerCase().startsWith(titleNorm.toLowerCase())) {
    return content.slice(titleNorm.length).trim();
  }
  if (titleMatch && content.toLowerCase().startsWith(titleMatch.toLowerCase())) {
    const rest = content.slice(titleMatch.length).trim();
    if (rest) return rest;
    const wordCount = titleMatch.split(" ").filter(Boolean).length;
    return stripWordPrefix(content, wordCount);
  }
  return content;
}

function titleMatchesBlock(
  blockPlain: string,
  titleNorm: string,
  titleMatch: string,
): boolean {
  return blockPlain.toLowerCase() === titleNorm.toLowerCase()
    || blockPlain.toLowerCase() === titleMatch.toLowerCase()
    || (
      titleMatch.length > 0
      && blockPlain.toLowerCase().startsWith(titleMatch.toLowerCase())
      && (blockPlain.length === titleMatch.length || blockPlain[titleMatch.length] === " ")
    );
}

function hasStructuredHtml(html: string): boolean {
  return /<(ul|ol|blockquote|pre|table|div\s+class=["']legal-provision)/i.test(html);
}

function blockPlainText(node: JSONContent): string {
  const doc: EditorDoc = {
    version: 4,
    content: { type: "doc", content: [node] },
  };
  return normalizePlain(htmlToPlain(docToHtml(doc)));
}

/**
 * Remove a title prefix from a V4 doc without flattening lists or block structure.
 */
export function stripTitleFromDoc(title: string, doc: EditorDoc): EditorDoc {
  const titleNorm = normalizePlain(title);
  if (!titleNorm) return doc;

  const titleMatch = titleNorm.replace(/\.\.\.$/, "").trim();
  const blocks = [...(doc.content.content ?? [])];
  if (blocks.length === 0) return doc;

  const firstPlain = blockPlainText(blocks[0]);
  if (titleMatchesBlock(firstPlain, titleNorm, titleMatch)) {
    if (blocks.length > 1) {
      return { version: 4, content: { type: "doc", content: blocks.slice(1) } };
    }

    if (blocks[0].type === "paragraph" && Array.isArray(blocks[0].content)) {
      const remainder = stripPlainPrefix(firstPlain, titleNorm, titleMatch);
      if (remainder.trim()) {
        return {
          version: 4,
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: remainder }] }],
          },
        };
      }
    }

    return doc;
  }

  // Inline title prefix in first paragraph (e.g. exam question duplicated at body start)
  if (blocks[0].type === "paragraph") {
    const remainder = stripPlainPrefix(firstPlain, titleNorm, titleMatch);
    if (remainder !== firstPlain && remainder.trim()) {
      return {
        version: 4,
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: remainder }] },
            ...blocks.slice(1),
          ],
        },
      };
    }
  }

  return doc;
}

/**
 * Remove a title prefix from plain + HTML module content so the title is not
 * duplicated in the essay body. Returns original content if stripping would
 * empty the body.
 */
export function stripTitleFromContent(
  title: string,
  contentText: string,
  contentHtml: string,
): { contentText: string; contentHtml: string } {
  const titleNorm = normalizePlain(title);
  if (!titleNorm) return { contentText, contentHtml };

  const titleMatch = titleNorm.replace(/\.\.\.$/, "").trim();
  const contentNorm = normalizePlain(contentText);

  const blocks = splitHtmlIntoBlocks(contentHtml);
  if (blocks.length > 0) {
    const firstPlain = normalizePlain(htmlToPlain(blocks[0]));
    const matchesBlock = titleMatchesBlock(firstPlain, titleNorm, titleMatch);

    if (matchesBlock) {
      if (blocks.length > 1) {
        const newHtml = joinHtmlBlocks(blocks.slice(1));
        const newText = htmlToPlain(newHtml);
        if (newText.trim()) return { contentText: newText, contentHtml: newHtml };
      }
      const remainder = stripPlainPrefix(firstPlain, titleNorm, titleMatch);
      if (remainder.trim() && !hasStructuredHtml(contentHtml)) {
        return { contentText: remainder, contentHtml: `<p>${remainder}</p>` };
      }
    }
  }

  if (hasStructuredHtml(contentHtml)) {
    return { contentText, contentHtml };
  }

  const stripped = stripPlainPrefix(contentNorm, titleNorm, titleMatch);
  if (stripped !== contentNorm && stripped.trim()) {
    const newHtml = stripped.split("\n").filter(Boolean).map((l) => `<p>${l}</p>`).join("\n");
    return { contentText: stripped, contentHtml: newHtml };
  }

  return { contentText, contentHtml };
}

/** Derive essay title from first N words and strip that prefix from the body. */
export function deriveTitleAndBody(
  text: string,
  html: string,
  contentDoc?: EditorDoc,
  wordCount = 7,
): { title: string; contentText: string; contentHtml: string; contentDoc: EditorDoc } {
  const plain = text.replace(/\s+/g, " ").trim();
  const safeHtml = html?.trim() || `<p>${plain}</p>`;
  const baseDoc = contentDoc ?? htmlToDoc(safeHtml);
  const title = firstWords(plain, wordCount) || "Novi esej";
  const strippedDoc = stripTitleFromDoc(title, baseDoc);
  const strippedHtml = docToHtml(strippedDoc);
  const strippedText = htmlToPlain(strippedHtml);
  return {
    title,
    contentText: strippedText,
    contentHtml: strippedHtml,
    contentDoc: strippedDoc,
  };
}

/**
 * Parse selected text and split into article modules.
 * If no Član boundaries found, returns hasArticles=false.
 */
export function splitSelection(selectedText: string): SelectionSplitResult {
  const lines = selectedText.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Find all article boundaries (skip lines that are headings)
  const boundaries: { lineIndex: number; articleNum: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Skip heading-like lines (from stripped h1/h2/h3 or markdown-style)
    if (HEADING_LINE_REGEX.test(lines[i])) continue;
    const match = lines[i].match(ARTICLE_REGEX);
    if (match) {
      boundaries.push({ lineIndex: i, articleNum: match[1] });
    }
  }

  // No articles found — not splittable
  if (boundaries.length === 0) {
    return { hasArticles: false, modules: [], rangeLabel: "", parentName: "" };
  }

  const modules: SelectionModule[] = [];

  for (let b = 0; b < boundaries.length; b++) {
    const { lineIndex, articleNum } = boundaries[b];
    const nextBoundaryLine = b + 1 < boundaries.length ? boundaries[b + 1].lineIndex : lines.length;

    // Look for title: line immediately above the "Član X" line
    let title = "";
    if (lineIndex > 0) {
      const candidate = lines[lineIndex - 1];
      // Only use as title if short (≤80 chars) and not itself an article header
      if (candidate.length <= 80 && !candidate.match(ARTICLE_REGEX)) {
        // Check it's not content of the previous article
        let isTitleCandidate = true;
        if (b > 0) {
          const prevEnd = boundaries[b - 1].lineIndex;
          // If candidate is the ONLY content between prev article and this one, don't steal it
          let contentCount = 0;
          for (let k = prevEnd + 1; k < lineIndex; k++) {
            if (lines[k].trim()) contentCount++;
          }
          if (contentCount <= 1) isTitleCandidate = false;
        }
        if (isTitleCandidate) {
          title = candidate;
        }
      }
    }

    // Collect content lines (after "Član X" line, before next boundary/title)
    let contentEnd = nextBoundaryLine;
    // If next boundary exists and has a title line above it, exclude that title line
    if (b + 1 < boundaries.length) {
      const nextLine = boundaries[b + 1].lineIndex;
      if (nextLine > 0) {
        const possibleTitle = lines[nextLine - 1];
        if (possibleTitle && possibleTitle.length <= 80 && !possibleTitle.match(ARTICLE_REGEX)) {
          // Count content between to decide
          let contentCount = 0;
          for (let k = lineIndex + 1; k < nextLine; k++) {
            if (lines[k].trim()) contentCount++;
          }
          if (contentCount >= 2) {
            contentEnd = nextLine - 1;
          }
        }
      }
    }

    const contentLines: string[] = [];
    for (let j = lineIndex + 1; j < contentEnd; j++) {
      if (lines[j].trim() && !HEADING_LINE_REGEX.test(lines[j]) && !isStructuralLine(lines[j])) contentLines.push(lines[j]);
    }

    // Fallback title from first 7 words — strip those words from first content line
    let displayTitle: string;
    if (title) {
      displayTitle = title;
    } else if (contentLines.length > 0) {
      const firstLine = contentLines[0];
      displayTitle = firstWords(firstLine, 7);
      const rest = stripWordPrefix(firstLine, 7);
      if (rest) contentLines[0] = rest;
      else contentLines.shift();
    } else {
      displayTitle = `Član ${articleNum}`;
    }
    const formattedTitle = `čl. ${articleNum} ${displayTitle}`;

    const contentText = contentLines.join("\n");
    const contentHtml = contentLines.map(l => `<p>${l}</p>`).join("\n");
    const plainSnippet = `Član ${articleNum}\n${contentText}`;

    modules.push({
      id: newUuid(),
      articleNum,
      title: formattedTitle,
      contentText,
      contentHtml,
      plainSnippet,
    });
  }

  const firstNum = modules[0]?.articleNum || "";
  const lastNum = modules[modules.length - 1]?.articleNum || "";
  const rangeLabel = firstNum === lastNum ? `čl. ${firstNum}` : `čl. ${firstNum} – čl. ${lastNum}`;
  const parentName = modules[0]?.title || rangeLabel;

  return { hasArticles: true, modules, rangeLabel, parentName };
}

/**
 * Create an empty module — used by the wizard when the user manually adds a
 * new module. Title defaults to "Novi modul"; content stays empty so the user
 * pastes/types into the editor.
 */
export function createEmptyModule(title = "Novi modul"): SelectionModule {
  return {
    id: newUuid(),
    articleNum: "",
    title,
    contentText: "",
    contentHtml: "",
    plainSnippet: title,
  };
}

/** Strip HTML tags to get plain text fallback (used after manual edits). */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Top-level block tags considered as standalone units in the wizard. */
const BLOCK_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "BLOCKQUOTE", "PRE", "TABLE", "FIGURE", "HR",
]);

/**
 * Parse HTML into an ordered list of top-level block HTML strings.
 * Inline content between blocks is collected into <p> wrappers so nothing is lost.
 * Falls back to a single <p> wrap when DOMParser is unavailable.
 */
export function splitHtmlIntoBlocks(html: string): string[] {
  const trimmed = (html || "").trim();
  if (!trimmed) return [];
  if (typeof DOMParser === "undefined") return [trimmed];
  try {
    const doc = new DOMParser().parseFromString(`<div id="__root">${trimmed}</div>`, "text/html");
    const root = doc.getElementById("__root");
    if (!root) return [trimmed];
    const out: string[] = [];
    let inlineBuffer = "";
    const flushInline = () => {
      const t = inlineBuffer.trim();
      if (t) out.push(`<p>${t}</p>`);
      inlineBuffer = "";
    };
    root.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (BLOCK_TAGS.has(el.tagName)) {
          flushInline();
          out.push(el.outerHTML);
        } else {
          inlineBuffer += (el as HTMLElement).outerHTML;
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent || "";
        if (t.trim()) inlineBuffer += t;
      }
    });
    flushInline();
    return out.length > 0 ? out : [`<p>${trimmed}</p>`];
  } catch {
    return [`<p>${trimmed}</p>`];
  }
}

export function joinHtmlBlocks(blocks: string[]): string {
  return blocks.join("\n");
}

/**
 * Split a single module's content into N modules using a delimiter.
 * Delimiter modes:
 *  - "blank-line"  → split on one or more blank lines (paragraph breaks)
 *  - "article"     → split on /^Član\s+\d+/ markers (re-runs auto-detection on body)
 *  - { custom: s } → split on the literal string `s` (e.g. "---")
 *
 * Returns at least 1 module. If split would yield only 1 chunk, returns the
 * input unchanged (wrapped in an array). The first chunk inherits the original
 * module's title; subsequent chunks get auto-titles from their first words.
 */
export function splitModuleByDelimiter(
  mod: SelectionModule,
  delim: "blank-line" | "article" | { custom: string },
): SelectionModule[] {
  const sourceText = mod.contentText || htmlToPlain(mod.contentHtml);
  if (!sourceText.trim()) return [mod];

  let chunks: string[];
  if (delim === "blank-line") {
    chunks = sourceText.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
  } else if (delim === "article") {
    // Re-run full split engine on this module's text
    const result = splitSelection(sourceText);
    if (result.hasArticles && result.modules.length > 1) return result.modules;
    return [mod];
  } else {
    const lit = delim.custom;
    if (!lit) return [mod];
    chunks = sourceText.split(lit).map(s => s.trim()).filter(Boolean);
  }

  if (chunks.length <= 1) return [mod];

  return chunks.map((chunk, i) => {
    const lines = chunk.split(/\n/).filter(Boolean);
    const title = i === 0
      ? mod.title
      : (firstWords(lines[0] || chunk, 7) || `Modul ${i + 1}`);
    const contentHtml = lines.map(l => `<p>${l}</p>`).join("\n");
    return {
      id: i === 0 ? mod.id : newUuid(),
      articleNum: i === 0 ? mod.articleNum : "",
      title,
      contentText: chunk,
      contentHtml,
      plainSnippet: chunk,
      editorRevision: i === 0 ? (mod.editorRevision ?? 0) + 1 : 0,
    };
  });
}

