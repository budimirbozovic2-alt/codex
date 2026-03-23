/**
 * Coverage Analysis Engine
 * Computes which parts of a source text are "covered" by linked cards.
 * Uses memoization to avoid recomputation on re-renders.
 */
import type { Card } from "./spaced-repetition";

export interface CoverageRange {
  start: number;
  end: number;
  cardId: string;
  cardQuestion: string;
}

export interface CoverageResult {
  ranges: CoverageRange[];
  coveredChars: number;
  totalChars: number;
  percent: number;
}

// Simple cache keyed by sourceId + card count + total text length
const cache = new Map<string, CoverageResult>();

/**
 * Strip HTML tags to get plain text for matching.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * Normalize text for fuzzy matching: lowercase, collapse whitespace, trim.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Find all occurrences of `needle` in `haystack` (both normalized).
 * Returns ranges in the original (pre-normalized) text by tracking
 * character mapping.
 */
function findAllOccurrences(
  originalText: string,
  normalizedText: string,
  needle: string,
): { start: number; end: number }[] {
  if (!needle || needle.length < 10) return [];

  const results: { start: number; end: number }[] = [];
  let searchFrom = 0;

  while (searchFrom < normalizedText.length) {
    const idx = normalizedText.indexOf(needle, searchFrom);
    if (idx === -1) break;
    results.push({ start: idx, end: idx + needle.length });
    searchFrom = idx + 1;
  }

  return results;
}

/**
 * Merge overlapping ranges and sort.
 */
function mergeRanges(ranges: CoverageRange[]): CoverageRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: CoverageRange[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      // Overlap — extend but keep earliest card info
      if (sorted[i].end > last.end) {
        merged[merged.length - 1] = {
          ...last,
          end: sorted[i].end,
          // Combine card names
          cardQuestion: last.cardId === sorted[i].cardId
            ? last.cardQuestion
            : `${last.cardQuestion}; ${sorted[i].cardQuestion}`,
        };
      }
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

/**
 * Analyze coverage: which parts of the source HTML content are covered by cards.
 */
export function analyzeCoverage(
  sourceId: string,
  sourceHtmlContent: string,
  cards: Card[],
): CoverageResult {
  const linkedCards = cards.filter(
    c => c.sourceId === sourceId && c.originalSourceSnippet
  );

  const cacheKey = `${sourceId}_${linkedCards.length}_${sourceHtmlContent.length}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const plainText = stripHtml(sourceHtmlContent);
  const normalizedFull = normalize(plainText);
  const totalChars = normalizedFull.length;

  if (totalChars === 0) {
    const empty: CoverageResult = { ranges: [], coveredChars: 0, totalChars: 0, percent: 0 };
    cache.set(cacheKey, empty);
    return empty;
  }

  const allRanges: CoverageRange[] = [];

  for (const card of linkedCards) {
    const snippet = normalize(card.originalSourceSnippet!);
    const occurrences = findAllOccurrences(plainText, normalizedFull, snippet);

    for (const occ of occurrences) {
      allRanges.push({
        start: occ.start,
        end: occ.end,
        cardId: card.id,
        cardQuestion: card.question,
      });
    }
  }

  const merged = mergeRanges(allRanges);

  // Calculate covered chars (from merged ranges to avoid double-counting)
  let coveredChars = 0;
  for (const r of merged) {
    coveredChars += r.end - r.start;
  }

  const result: CoverageResult = {
    ranges: merged,
    coveredChars,
    totalChars,
    percent: Math.round((coveredChars / totalChars) * 100),
  };

  cache.set(cacheKey, result);

  // Trim cache
  if (cache.size > 20) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }

  return result;
}

/**
 * Invalidate cache for a specific source.
 */
export function invalidateCoverageCache(sourceId: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(sourceId)) cache.delete(key);
  }
}
