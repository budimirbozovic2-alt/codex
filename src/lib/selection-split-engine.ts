/**
 * Selection Smart-Split Engine
 * Parses selected text from a source for Član boundaries,
 * creates parent-child essay structure automatically.
 */

export interface SelectionModule {
  /** e.g. "59" */
  articleNum: string;
  /** Title: "čl. 59 Pojam podnesaka" */
  title: string;
  /** Raw content text of this article */
  contentText: string;
  /** HTML content (wrapped in <p> tags) */
  contentHtml: string;
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

    // Fallback title from first 7 words
    const displayTitle = title || (contentLines.length > 0 ? firstWords(contentLines[0], 7) : `Član ${articleNum}`);
    const formattedTitle = `čl. ${articleNum} ${displayTitle}`;

    const contentText = contentLines.join("\n");
    const contentHtml = contentLines.map(l => `<p>${l}</p>`).join("\n");
    const plainSnippet = `Član ${articleNum}\n${contentText}`;

    modules.push({
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
    articleNum: "",
    title,
    contentText: "",
    contentHtml: "",
    plainSnippet: title,
  };
}

/** Strip HTML tags to get plain text fallback (used after manual edits). */
function htmlToPlain(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
      articleNum: i === 0 ? mod.articleNum : "",
      title,
      contentText: chunk,
      contentHtml,
      plainSnippet: chunk,
    };
  });
}

