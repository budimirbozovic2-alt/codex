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

/** Extract first N words from text for fallback title */
function firstWords(text: string, n = 7): string {
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

  // Find all article boundaries
  const boundaries: { lineIndex: number; articleNum: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
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
      if (lines[j].trim()) contentLines.push(lines[j]);
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
