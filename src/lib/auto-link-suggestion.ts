import type { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/db";
import { loadSources } from "@/lib/sources-storage";

export interface AutoLinkPair {
  card: Card;
  suggestedSource: Source;
}

/** Strip HTML tags for plain-text matching */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Bulk scan: find unlinked cards that match a source by label.
 *
 * Since Source has no `category` field, we infer a source's category
 * from cards already linked to it. If no cards are linked yet,
 * the source is considered "uncategorized" and matches any card.
 *
 * Rule A: card.category must match the source's inferred category (or source has none).
 * Rule B: source.label exactly matches card.question (stripped), OR
 *         source.label appears as substring in card.question or any section content.
 */
export async function findBulkAutoLinkSuggestions(
  cards: Card[],
  sourcesParam?: Source[],
): Promise<AutoLinkPair[]> {
  const sources = sourcesParam ?? await loadSources();
  if (sources.length === 0) return [];

  // Build source → inferred category map from existing links
  const sourceCategoryMap = new Map<string, string>();
  for (const card of cards) {
    if (card.sourceId && !sourceCategoryMap.has(card.sourceId)) {
      sourceCategoryMap.set(card.sourceId, card.category);
    }
  }

  // Pre-compute lowercase labels
  const sourceIndex = sources.map(s => ({
    source: s,
    labelLower: s.label.trim().toLowerCase(),
    inferredCategory: sourceCategoryMap.get(s.id),
  }));

  const results: AutoLinkPair[] = [];
  const seen = new Set<string>(); // prevent duplicate card matches

  for (const card of cards) {
    // Skip cards already linked
    if (card.sourceId) continue;
    if (seen.has(card.id)) continue;
    if (card.type === "flash") continue;

    const questionPlain = stripHtml(card.question);

    for (const { source, labelLower, inferredCategory } of sourceIndex) {
      // Rule A: category must match (if source has an inferred category)
      if (inferredCategory && inferredCategory !== card.category) continue;

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
          const contentPlain = stripHtml(section.content);
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
