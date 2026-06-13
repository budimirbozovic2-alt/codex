import type { Card, SourceModule } from "@/lib/spaced-repetition";
import { stripHtmlText } from "@/lib/sanitize";

// Re-exported so existing imports from "@/lib/source-coverage" keep working.
export { stripHtmlText };

export interface CoverageModuleRef {
  id: string;
  cardId: string;
  question: string;
  snippet: string;
  title: string;
  order: number;
}

export function normalizeMatchText(text: string): string {
  return stripHtmlText(text).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeModule(cardId: string, module: SourceModule, fallbackQuestion: string): CoverageModuleRef {
  return {
    id: module.id,
    cardId,
    question: module.question || fallbackQuestion,
    snippet: module.originalSourceSnippet,
    title: module.title,
    order: module.order,
  };
}

export function collectSourceCoverageModules(cards: Card[], sourceId: string): CoverageModuleRef[] {
  return cards
    .filter(card => card.sourceId === sourceId)
    .flatMap(card => {
      if (card.sourceModules && card.sourceModules.length > 0) {
        return card.sourceModules.map(module => normalizeModule(card.id, module, card.question));
      }

      if (!card.originalSourceSnippet) return [];
      return [{
        id: card.id,
        cardId: card.id,
        question: card.question,
        snippet: card.originalSourceSnippet,
        title: card.question,
        order: 0,
      }];
    })
    .filter(module => normalizeMatchText(module.snippet).length >= 10);
}