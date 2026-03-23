import type { Card, SourceModule } from "@/lib/spaced-repetition";
import { detectArticles } from "@/lib/auto-split-engine";

export interface CoverageModuleRef {
  id: string;
  cardId: string;
  question: string;
  snippet: string;
  title: string;
  order: number;
}

export interface CoveredSourceArticle {
  key: string;
  articleNum: string;
  title: string;
  essayName: string;
  contentHtml: string;
  plainSnippet: string;
  processed: boolean;
  matchedModules: CoverageModuleRef[];
  linkedCardIds: string[];
}

export function stripHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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

export function getCoveredSourceArticles(sourceHtml: string, cards: Card[], sourceId: string): CoveredSourceArticle[] {
  const modules = collectSourceCoverageModules(cards, sourceId);
  return detectArticles(sourceHtml).map(article => {
    const articleNormalized = normalizeMatchText(article.plainSnippet);
    const matchedModules = modules.filter(module => {
      const normalizedSnippet = normalizeMatchText(module.snippet);
      return !!normalizedSnippet && (
        articleNormalized.includes(normalizedSnippet) || normalizedSnippet.includes(articleNormalized)
      );
    });

    return {
      key: `article-${article.articleNum}`,
      articleNum: article.articleNum,
      title: article.title,
      essayName: article.essayName,
      contentHtml: article.contentHtml,
      plainSnippet: article.plainSnippet,
      processed: matchedModules.length > 0,
      matchedModules,
      linkedCardIds: [...new Set(matchedModules.map(module => module.cardId))],
    };
  });
}