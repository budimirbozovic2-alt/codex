// M1 decomposition — aggregates (buckets, dueCards, stats, per-category
// stats) extracted from CardStateProvider. Pure derivation layer.
import { useCallback, useMemo, useRef } from "react";
import {
  Card,
  SectionState,
  isLeech,
  getSectionScore,
} from "@/lib/spaced-repetition";
import {
  buildCardBuckets,
  bucketFingerprint,
  EMPTY_BUCKETS,
  type CardBuckets,
} from "@/lib/card-buckets";

interface CardSummary {
  totalSections: number;
  learnedSections: number;
  leechCount: number;
  scoreAvg: number;
  /** Earliest nextReview among non-New sections, or Infinity. */
  minNonNewNextReview: number;
}

export interface CardAggregates {
  dueCards: Card[];
  stats: { due: number; total: number; totalSections: number; learnedSections: number; leechCount: number };
  cardCountByCategory: Record<string, number>;
  buckets: CardBuckets;
  categoryStats: Record<string, { score: number; total: number; due: number }>;
}

export function useCardAggregates(cards: Card[], categories: string[]): CardAggregates {
  const bucketCacheRef = useRef<{ fp: string; buckets: CardBuckets } | null>(null);
  const buckets = useMemo(() => {
    const fp = bucketFingerprint(cards);
    const cached = bucketCacheRef.current;
    if (cached && cached.fp === fp) return cached.buckets;
    const fresh = cards.length === 0 ? EMPTY_BUCKETS : buildCardBuckets(cards);
    bucketCacheRef.current = { fp, buckets: fresh };
    return fresh;
  }, [cards]);

  const cardSummaryCacheRef = useRef<WeakMap<Card, CardSummary>>(new WeakMap());
  const summarizeCard = useCallback((card: Card): CardSummary => {
    const cached = cardSummaryCacheRef.current.get(card);
    if (cached) return cached;
    let totalSections = 0;
    let learnedSections = 0;
    let leechCount = 0;
    let scoreSum = 0;
    let minNonNewNextReview = Infinity;
    for (const s of card.sections) {
      totalSections++;
      const isNew = s.state === SectionState.New;
      if (!isNew) {
        learnedSections++;
        if (s.nextReview < minNonNewNextReview) minNonNewNextReview = s.nextReview;
      }
      if (isLeech(s)) leechCount++;
      scoreSum += getSectionScore(s);
    }
    const summary: CardSummary = {
      totalSections,
      learnedSections,
      leechCount,
      scoreAvg: totalSections > 0 ? scoreSum / totalSections : 0,
      minNonNewNextReview,
    };
    cardSummaryCacheRef.current.set(card, summary);
    return summary;
  }, []);

  const aggregate = useMemo(() => {
    const now = Date.now();
    const dueList: Card[] = [];
    const dueSortKeys = new Map<string, number>();
    let totalSections = 0;
    let learnedSections = 0;
    let leechCount = 0;
    const perCatAccum: Record<string, { scoreSum: number; total: number; due: number }> = {};
    const countByCategory: Record<string, number> = {};

    for (const card of cards) {
      const sum = summarizeCard(card);
      const catKey = card.categoryId;
      countByCategory[catKey] = (countByCategory[catKey] || 0) + 1;
      totalSections += sum.totalSections;
      learnedSections += sum.learnedSections;
      leechCount += sum.leechCount;

      const cardIsDue = sum.minNonNewNextReview <= now;
      if (cardIsDue) {
        dueList.push(card);
        dueSortKeys.set(card.id, sum.minNonNewNextReview);
      }

      let acc = perCatAccum[catKey];
      if (!acc) {
        acc = { scoreSum: 0, total: 0, due: 0 };
        perCatAccum[catKey] = acc;
      }
      acc.total++;
      acc.scoreSum += sum.scoreAvg;
      if (cardIsDue) acc.due++;
    }

    return {
      dueList,
      dueSortKeys,
      totalSections,
      learnedSections,
      leechCount,
      perCatAccum,
      countByCategory,
      totalCards: cards.length,
    };
  }, [cards, summarizeCard]);

  const dueCards = useMemo(() => {
    const list = aggregate.dueList.slice();
    const keys = aggregate.dueSortKeys;
    list.sort((a, b) => (keys.get(a.id) ?? Infinity) - (keys.get(b.id) ?? Infinity));
    return list;
  }, [aggregate.dueList, aggregate.dueSortKeys]);

  const stats = useMemo(
    () => ({
      due: aggregate.dueList.length,
      total: aggregate.totalCards,
      totalSections: aggregate.totalSections,
      learnedSections: aggregate.learnedSections,
      leechCount: aggregate.leechCount,
    }),
    [aggregate],
  );

  const cardCountByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    for (const cat of categories) out[cat] = 0;
    for (const k in aggregate.countByCategory) out[k] = aggregate.countByCategory[k];
    return out;
  }, [aggregate.countByCategory, categories]);

  const categoryStats = useMemo(() => {
    const out: Record<string, { score: number; total: number; due: number }> = {};
    for (const cat of categories) {
      const a = aggregate.perCatAccum[cat];
      out[cat] = a
        ? { score: a.total > 0 ? Math.round(a.scoreSum / a.total) : 0, total: a.total, due: a.due }
        : { score: 0, total: 0, due: 0 };
    }
    return out;
  }, [aggregate.perCatAccum, categories]);

  return { dueCards, stats, cardCountByCategory, buckets, categoryStats };
}
