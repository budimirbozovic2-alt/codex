/**
 * Auto-Split Engine for Legal Documents
 * Detects articles (Član) with their titles and content,
 * enabling batch essay generation from legal source texts.
 *
 * Supports two scanning modes:
 *   A) Standard: Title + Član + Content
 *   B) Articles-only: When no title exists, auto-generates from first words
 */

export interface DetectedArticle {
  /** e.g. "59" or "10a" */
  articleNum: string;
  /** Title line found above the Član line (or auto-generated) */
  title: string;
  /** Whether the title was auto-generated from content */
  autoTitle: boolean;
  /** Full essay name: "Čl. 59 Pojam, sadržina..." */
  essayName: string;
  /** HTML content of the article body */
  contentHtml: string;
  /** Plain text snippet for backlink */
  plainSnippet: string;
}

/** Extract first N words from text for auto-title */
function firstWords(text: string, n = 6): string {
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "";
  const slice = words.slice(0, n).join(" ");
  return words.length > n ? slice + "..." : slice;
}

const STRUCTURAL_KEYWORDS = /^\s*(DIO|GLAVA|POGLAVLJE|ODJELJAK|CZĘŚĆ|TYTUŁ)\b/i;

/** Detect structural legal headings that should be excluded from card body */
function isStructuralLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (trimmed.length <= 80 && trimmed === trimmed.toUpperCase() && /[A-ZČĆŽŠĐ]/.test(trimmed)) return true;
  if (STRUCTURAL_KEYWORDS.test(trimmed)) return true;
  return false;
}

/**
 * Parse source HTML and detect legal articles with titles.
 *
 * Mode A (Standard): Looks for a title line immediately above "Član X".
 * Mode B (Articles-only): If no title found, generates one from the first
 *   5-7 words of the article's first paragraph.
 */
export function detectArticles(html: string): DetectedArticle[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const elements = Array.from(doc.body.children);

  interface Line {
    text: string;
    html: string;
    isArticle: boolean;
    articleNum: string;
    isHeading: boolean;
  }

  const articleRegex = /^\s*(?:Č|č)(?:lan|LANAK|L(?:AN|ANAK)?\.?)\s+(\d+[a-z]?)\.?\s*$/i;
  const headingTags = new Set(["H1", "H2", "H3"]);

  const lines: Line[] = [];
  for (const el of elements) {
    const text = (el.textContent || "").trim();
    const outerHtml = el.outerHTML || "";
    // Skip heading elements — they are structural, not articles
    const isHeading = headingTags.has(el.tagName);
    const match = isHeading ? null : text.match(articleRegex);
    lines.push({
      text,
      html: outerHtml,
      isArticle: !!match,
      articleNum: match ? match[1] : "",
      isHeading,
    });
  }

  const articles: DetectedArticle[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].isArticle) continue;

    const articleNum = lines[i].articleNum;

    // ── Look backwards for title (Mode A) ──
    let title = "";
    let autoTitle = false;
    if (i > 0) {
      const candidate = lines[i - 1];
      if (candidate.text && !candidate.isArticle) {
        // Only treat as title if:
        // 1. It's directly above (no other article between)
        // 2. It looks like a heading (short, ≤80 chars) not a content paragraph
        let belongsToPrevArticle = false;
        for (let k = i - 2; k >= 0; k--) {
          if (lines[k].isArticle) {
            // Check if this candidate is the ONLY content of the previous article
            let contentCount = 0;
            for (let m = k + 1; m < i; m++) {
              if (lines[m].text && !lines[m].isArticle) contentCount++;
            }
            // If the previous article would lose its only content, don't steal it
            if (contentCount <= 1) belongsToPrevArticle = true;
            break;
          }
        }
        if (!belongsToPrevArticle && candidate.text.length <= 80) {
          title = candidate.text;
        }
      }
    }

    // ── Collect content ──
    const contentParts: string[] = [];
    const plainParts: string[] = [];
    let nextBoundary = lines.length;

    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].isArticle) {
        nextBoundary = j;
        // Only reserve the line before next article as its title
        // if there are multiple content lines between articles
        const contentLinesBetween = [];
        for (let k = i + 1; k < j; k++) {
          if (lines[k].text && !lines[k].isArticle && !lines[k].isHeading) {
            contentLinesBetween.push(k);
          }
        }
        // If there are ≥2 content lines and the last one looks like a title
        // (the next article will pick it up via backward scan), exclude it
        if (contentLinesBetween.length >= 2) {
          const lastContentIdx = contentLinesBetween[contentLinesBetween.length - 1];
          // Check if this last line is actually used as title by next article
          // by verifying it's directly adjacent (no other articles between)
          nextBoundary = lastContentIdx;
        }
        break;
      }
    }

    for (let j = i + 1; j < nextBoundary; j++) {
      if (lines[j].text && !lines[j].isHeading && !isStructuralLine(lines[j].text)) {
        contentParts.push(lines[j].html);
        plainParts.push(lines[j].text);
      }
    }

    // ── Mode B: Auto-generate title from first words ──
    if (!title && plainParts.length > 0) {
      title = firstWords(plainParts[0], 6);
      autoTitle = true;
    }

    const contentHtml = contentParts.join("\n");
    const plainSnippet = `Član ${articleNum}\n${plainParts.join("\n")}`;
    const essayName = title
      ? `Čl. ${articleNum} ${title}`
      : `Čl. ${articleNum}`;

    articles.push({
      articleNum,
      title,
      autoTitle,
      essayName,
      contentHtml,
      plainSnippet,
    });
  }

  return articles;
}
