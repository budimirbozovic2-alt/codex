/**
 * Pure cognitive-resistance aggregator. Heavy O(cards * sections) batch used
 * by `ResistanceTab`. Runs inside the analytics worker so main thread stays
 * responsive even at 15k+ cards.
 *
 * Card-level retrievability is inlined here (instead of importing
 * `getCardRetrievability`) so the module stays free of `@/lib/sr/*` deps
 * — required for the `_pure/**` ESLint guard.
 */
import type { Card, Section } from "../../spaced-repetition";
import { SectionState } from "../../spaced-repetition";
import type { ReviewLogEntry } from "../../storage";
import type { LatencyEntry } from "@/domains/metacognition/metacognitive-storage";

export interface ResistanceWeights {
  lapses: number;
  latency: number;
  forgetting: number;
}

export interface ResistanceRow {
  categoryId: string;
  lapseCount: number;
  avgLatency: number;
  cognitiveLoad: number;
  cardCount: number;
}

function sectionRetrievability(s: Section): number {
  if (s.state === SectionState.New) return 0;
  if (s.stability <= 0) return 0;
  const elapsed = s.lastReviewed ? (Date.now() - s.lastReviewed) / 86_400_000 : 0;
  const r = Math.exp(-elapsed / s.stability);
  return Math.round(Math.max(0, Math.min(100, r * 100)));
}

function cardWorstRetrievability(card: Card): number {
  if (card.sections.length === 0) return 0;
  let min = Infinity;
  let any = false;
  for (const s of card.sections) {
    if (s.state === SectionState.New) continue;
    any = true;
    const r = sectionRetrievability(s);
    if (r < min) min = r;
  }
  return any ? min : 0;
}

function normalizedWeightFactors(weights: ResistanceWeights) {
  const wTotal = weights.lapses + weights.latency + weights.forgetting;
  return {
    wL: wTotal > 0 ? weights.lapses / wTotal : 0.33,
    wLat: wTotal > 0 ? weights.latency / wTotal : 0.33,
    wF: wTotal > 0 ? weights.forgetting / wTotal : 0.34,
  };
}

export function calcResistance(
  cards: Card[],
  categories: string[],
  reviewLog: ReviewLogEntry[],
  latency: LatencyEntry[],
  weightsByCategory: Record<string, ResistanceWeights>,
  fallbackWeights: ResistanceWeights,
): ResistanceRow[] {
  const cardsByCat = new Map<string, Card[]>();
  for (const c of cards) {
    const list = cardsByCat.get(c.categoryId);
    if (list) list.push(c);
    else cardsByCat.set(c.categoryId, [c]);
  }

  const lapsesByCat = new Map<string, number>();
  const reviewsByCat = new Map<string, number>();
  for (const e of reviewLog) {
    reviewsByCat.set(e.category, (reviewsByCat.get(e.category) ?? 0) + 1);
    if (e.grade <= 2) lapsesByCat.set(e.category, (lapsesByCat.get(e.category) ?? 0) + 1);
  }

  const latSumByCat = new Map<string, { sum: number; n: number }>();
  for (const l of latency) {
    const acc = latSumByCat.get(l.category) ?? { sum: 0, n: 0 };
    acc.sum += l.latencyMs;
    acc.n += 1;
    latSumByCat.set(l.category, acc);
  }

  const rows: ResistanceRow[] = [];
  for (const cat of categories) {
    const catCards = cardsByCat.get(cat);
    if (!catCards || catCards.length === 0) continue;

    const weights = weightsByCategory[cat] ?? fallbackWeights;
    const { wL, wLat, wF } = normalizedWeightFactors(weights);

    const lapseCount = lapsesByCat.get(cat) ?? 0;
    const totalReviews = reviewsByCat.get(cat) ?? 0;
    const latAcc = latSumByCat.get(cat);
    const avgLatency = latAcc && latAcc.n > 0 ? latAcc.sum / latAcc.n / 1000 : 0;

    const lapseRate = totalReviews > 0 ? (lapseCount / totalReviews) * 100 : 0;
    const latencyScore = Math.min(100, (avgLatency / 10) * 100);

    let retSum = 0;
    for (const c of catCards) retSum += cardWorstRetrievability(c) || 100;
    const avgRetrievability = retSum / catCards.length;
    const retrievabilityPenalty = Math.max(0, 100 - avgRetrievability);

    const cognitiveLoad = Math.round(lapseRate * wL + latencyScore * wLat + retrievabilityPenalty * wF);

    rows.push({
      categoryId: cat,
      lapseCount,
      avgLatency: +avgLatency.toFixed(1),
      cognitiveLoad: Math.min(100, cognitiveLoad),
      cardCount: catCards.length,
    });
  }

  rows.sort((a, b) => b.cognitiveLoad - a.cognitiveLoad);
  return rows;
}
