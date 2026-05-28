import type { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/db-types";
import { loadSourcesByCategory } from "@/lib/sources-storage";
import { stripHtmlText } from "@/lib/sanitize";
import { derivePlainText } from "@/lib/editor-v4/derived";

export interface AutoLinkPair {
  card: Card;
  suggestedSource: Source;
}

/** Lowercase plain-text projection for fuzzy matching. */
function stripHtml(html: string): string {
  return stripHtmlText(html).toLowerCase();
}

/**
 * Bulk scan: find unlinked cards that match a source by label.
 * Scoped by categoryId to prevent cross-category data leakage.
 */
export async function findBulkAutoLinkSuggestions(
  cards: Card[],
  categoryId: string,
  sourcesParam?: Source[],
): Promise<AutoLinkPair[]> {
  const sources = sourcesParam ?? await loadSourcesByCategory(categoryId);
  if (sources.length === 0) return [];

  // Pre-compute lowercase labels
  const sourceIndex = sources
    .filter(s => !!s.categoryId) // skip sources with no category
    .map(s => ({
      source: s,
      labelLower: s.title.trim().toLowerCase(),
    }));

  const results: AutoLinkPair[] = [];
  const seen = new Set<string>(); // prevent duplicate card matches

  for (const card of cards) {
    // Skip cards already linked
    if (card.sourceId) continue;
    if (seen.has(card.id)) continue;
    if (card.type === "flash") continue;

    const questionPlain = stripHtml(card.question);

    for (const { source, labelLower } of sourceIndex) {
      // Rule A: category must match (direct field)
      if (source.categoryId !== card.categoryId) continue;

      // Rule B: content match
      let matched = false;

      // Exact title match
      if (questionPlain === labelLower) {
        matched = true;
      }

      // Substring match in question
      if (!matched && labelLower.length >= 3 && questionPlain.includes(labelLower)) {
        matched = true;
      }

      // Substring match in section content
      if (!matched && labelLower.length >= 3) {
        for (const section of card.sections) {
          // PR-7c (M3 #9): derive from contentDoc (SSOT). Legacy `section.content` undefined post-v22.
          const contentPlain = derivePlainText(section.contentDoc).toLowerCase();
          if (contentPlain.includes(labelLower)) {
            matched = true;
            break;
          }
        }
      }

      if (matched) {
        results.push({ card, suggestedSource: source });
        seen.add(card.id);
        break; // one suggestion per card
      }
    }
  }

  return results;
}
