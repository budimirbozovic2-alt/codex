/**
 * Article-Level Legal Text Parser & Diff Engine
 *
 * Parses legal documents into structured articles (Član/Stav/Tačka)
 * and provides character-level diff comparison between versions
 * using diff-match-patch for precision.
 */

import DiffMatchPatch from "diff-match-patch";

// ─── Types ──────────────────────────────────────────────

export interface ParsedArticle {
  /** e.g. "Član 10" */
  id: string;
  /** Numeric article number for sorting */
  number: number;
  /** Full article title as found in text */
  title: string;
  /** Raw text content (stripped of HTML) */
  text: string;
  /** Original HTML content for this article */
  html: string;
}

export interface DiffSegment {
  type: "equal" | "insert" | "delete";
  text: string;
}

export interface ArticleDiff {
  articleId: string;
  articleTitle: string;
  status: "unchanged" | "modified" | "added" | "removed";
  segments: DiffSegment[];
  oldText?: string;
  newText?: string;
}

export interface DiffResult {
  diffs: ArticleDiff[];
  summary: {
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
  };
}

// ─── Article Parser ─────────────────────────────────────

/**
 * Regex patterns for Bosnian/Serbian/Croatian legal article formats.
 * Matches: "Član 1.", "Član 1", "ČLAN 10.", "Član 10a", etc.
 */
const ARTICLE_PATTERNS = [
  /(?:^|\n)\s*(?:Č|č)lan\s+(\d+[a-z]?)\.?\s*/gi,
  /(?:^|\n)\s*(?:Č|č)LANAK\s+(\d+[a-z]?)\.?\s*/gi,
  /(?:^|\n)\s*(?:Č|č)L(?:AN|ANAK)?\.\s*(\d+[a-z]?)\.?\s*/gi,
];

/** Extract plain text from HTML string */
function htmlToText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.textContent?.trim() || "";
}

/**
 * Parse HTML content into individual articles.
 * If no articles found, returns the entire text as a single article.
 */
export function parseArticles(html: string): ParsedArticle[] {
  const plainText = htmlToText(html);
  const articles: ParsedArticle[] = [];

  // Collect all article boundary positions
  interface Match { index: number; number: number; title: string; fullMatch: string }
  const matches: Match[] = [];

  for (const pattern of ARTICLE_PATTERNS) {
    // Reset lastIndex since we're reusing patterns
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(plainText)) !== null) {
      const num = parseInt(m[1]);
      if (!isNaN(num)) {
        // Avoid duplicates at the same position
        if (!matches.some(x => Math.abs(x.index - m!.index) < 5)) {
          matches.push({
            index: m.index,
            number: num,
            title: m[0].trim(),
            fullMatch: m[0],
          });
        }
      }
    }
  }

  // Sort by position in text
  matches.sort((a, b) => a.index - b.index);

  if (matches.length === 0) {
    // No articles found — return entire content as single entry
    return [{
      id: "full-text",
      number: 0,
      title: "Cijeli tekst",
      text: plainText,
      html,
    }];
  }

  // Split text into article segments
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : plainText.length;
    const text = plainText.slice(start, end).trim();
    // Include letter suffix (e.g. 10a) to avoid collisions
    const rawNum = plainText.slice(matches[i].index).match(/(?:Č|č)(?:lan|LANAK|L(?:AN|ANAK)?)\s*\.?\s*(\d+[a-z]?)/i);
    const articleSuffix = rawNum ? rawNum[1] : String(matches[i].number);
    const articleId = `član-${articleSuffix}`;

    articles.push({
      id: articleId,
      number: matches[i].number,
      title: `Član ${articleSuffix}`,
      text,
      html: "",
    });
  }

  // Now extract HTML segments for each article
  // We do this by finding article boundaries in the HTML
  const htmlArticleSegments = splitHtmlByArticles(html, matches.map(m => m.number));
  for (let i = 0; i < articles.length; i++) {
    if (htmlArticleSegments[i]) {
      articles[i].html = htmlArticleSegments[i];
    }
  }

  return articles;
}

/** Split HTML content by article numbers, preserving HTML structure */
function splitHtmlByArticles(html: string, articleNumbers: number[]): string[] {
  const segments: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const fullHtml = doc.body.innerHTML;

  // Build regex to find article boundaries in HTML
  const boundaryPattern = articleNumbers.map(n =>
    `(?:Č|č)(?:lan|LANAK|L(?:AN|ANAK)?)(?:\\.|\\s)\\\\s*${n}[a-z]?\\\\.?`
  ).join("|");

  if (!boundaryPattern) return [fullHtml];

  const re = new RegExp(`(${boundaryPattern})`, "gi");
  const parts = fullHtml.split(re);

  // Recombine: each article starts with its match
  let current = "";
  let started = false;
  for (const part of parts) {
    if (re.test(part)) {
      re.lastIndex = 0; // Reset after test
      if (started && current) {
        segments.push(current);
      }
      current = part;
      started = true;
    } else {
      re.lastIndex = 0;
      current += part;
    }
  }
  if (current && started) segments.push(current);

  return segments;
}

// ─── Diff Engine (diff-match-patch, character-level) ───

/**
 * Character-level diff using diff-match-patch.
 * Produces precise diffs even when only a single word changes.
 */
export function diffTexts(oldText: string, newText: string): DiffSegment[] {
  const normalizedOld = oldText.replace(/\s+/g, " ").trim();
  const normalizedNew = newText.replace(/\s+/g, " ").trim();

  if (normalizedOld === normalizedNew) {
    return [{ type: "equal", text: oldText }];
  }

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(normalizedOld, normalizedNew);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, text]) => ({
    type: op === 0 ? "equal" : op === -1 ? "delete" : "insert",
    text,
  }));
}

// ─── Full Source Diff ───────────────────────────────────

/**
 * Compare two versions of a source document at the article level.
 * Returns per-article diff results with targeted flagging info.
 */
export function compareVersions(oldHtml: string, newHtml: string): DiffResult {
  const oldArticles = parseArticles(oldHtml);
  const newArticles = parseArticles(newHtml);

  const oldMap = new Map(oldArticles.map(a => [a.id, a]));
  const newMap = new Map(newArticles.map(a => [a.id, a]));

  const diffs: ArticleDiff[] = [];
  let unchanged = 0, modified = 0, added = 0, removed = 0;

  // Check articles present in new version
  for (const newArt of newArticles) {
    const oldArt = oldMap.get(newArt.id);
    if (!oldArt) {
      // New article
      diffs.push({
        articleId: newArt.id,
        articleTitle: newArt.title,
        status: "added",
        segments: [{ type: "insert", text: newArt.text }],
        newText: newArt.text,
      });
      added++;
    } else {
      // Compare content
      const oldNorm = oldArt.text.replace(/\s+/g, " ").trim();
      const newNorm = newArt.text.replace(/\s+/g, " ").trim();

      if (oldNorm === newNorm) {
        diffs.push({
          articleId: newArt.id,
          articleTitle: newArt.title,
          status: "unchanged",
          segments: [{ type: "equal", text: newArt.text }],
        });
        unchanged++;
      } else {
        const segments = diffTexts(oldArt.text, newArt.text);
        diffs.push({
          articleId: newArt.id,
          articleTitle: newArt.title,
          status: "modified",
          segments,
          oldText: oldArt.text,
          newText: newArt.text,
        });
        modified++;
      }
    }
  }

  // Check for removed articles
  for (const oldArt of oldArticles) {
    if (!newMap.has(oldArt.id)) {
      diffs.push({
        articleId: oldArt.id,
        articleTitle: oldArt.title,
        status: "removed",
        segments: [{ type: "delete", text: oldArt.text }],
        oldText: oldArt.text,
      });
      removed++;
    }
  }

  // Sort: modified first, then added, then removed, then unchanged
  const statusOrder: Record<string, number> = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  diffs.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

  return {
    diffs,
    summary: { unchanged, modified, added, removed },
  };
}

/**
 * Get article IDs that have changes (for targeted card flagging).
 * Returns the set of article IDs where content has been modified or removed.
 */
export function getChangedArticleIds(diffResult: DiffResult): Set<string> {
  const changed = new Set<string>();
  for (const d of diffResult.diffs) {
    if (d.status === "modified" || d.status === "removed") {
      changed.add(d.articleId);
    }
  }
  return changed;
}

/**
 * Match a card's textAnchor to an article ID.
 * Returns the article whose text contains the anchor.
 */
export function matchAnchorToArticle(anchor: string, articles: ParsedArticle[]): string | null {
  const normalized = anchor.toLowerCase().replace(/\s+/g, " ");
  for (const art of articles) {
    const artNorm = art.text.toLowerCase().replace(/\s+/g, " ");
    if (artNorm.includes(normalized)) {
      return art.id;
    }
  }
  return null;
}
