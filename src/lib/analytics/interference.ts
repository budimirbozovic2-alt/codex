import { Card, getErrorStatus } from "../spaced-repetition";

export interface InterferencePair {
  cardA: { id: string; question: string; category: string };
  cardB: { id: string; question: string; category: string };
  sharedErrors: string[];
  score: number;
}

export function calcInterferencePairs(cards: Card[], limit = 10): InterferencePair[] {
  const byCategory = new Map<string, Card[]>();
  cards.forEach(c => {
    const activeErrors = (c.errorLog || []).filter(e => getErrorStatus(e) !== "mastered");
    if (activeErrors.length === 0) return;
    const list = byCategory.get(c.categoryId) || [];
    list.push(c);
    byCategory.set(c.categoryId, list);
  });

  const pairScores = new Map<string, { a: Card; b: Card; shared: string[]; score: number }>();

  byCategory.forEach((catCards) => {
    if (catCards.length < 2) return;

    const cardErrors = catCards.map(c => {
      const errors = (c.errorLog || [])
        .filter(e => getErrorStatus(e) !== "mastered")
        .map(e => e.text.toLowerCase().trim().slice(0, 80))
        .filter(t => t.length >= 5);
      const prefixes = errors.map(e => e.slice(0, 15));
      const words = new Set(c.question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      return { card: c, errors, prefixes: new Set(prefixes), words };
    });

    const prefixToIndices = new Map<string, number[]>();
    cardErrors.forEach((ce, idx) => {
      ce.prefixes.forEach(prefix => {
        const list = prefixToIndices.get(prefix) || [];
        list.push(idx);
        prefixToIndices.set(prefix, list);
      });
    });

    const checkedPairs = new Set<string>();

    cardErrors.forEach((ceA, idxA) => {
      const candidateIndices = new Set<number>();
      ceA.prefixes.forEach(prefix => {
        (prefixToIndices.get(prefix) || []).forEach(idx => {
          if (idx > idxA) candidateIndices.add(idx);
        });
      });

      candidateIndices.forEach(idxB => {
        const pairKey = `${idxA}:${idxB}`;
        if (checkedPairs.has(pairKey)) return;
        checkedPairs.add(pairKey);

        const ceB = cardErrors[idxB];

        const shared: string[] = [];
        ceA.errors.forEach(eA => {
          const prefixA = eA.slice(0, 15);
          if (ceB.prefixes.has(prefixA)) {
            const match = ceB.errors.find(eB =>
              eA === eB || eB.includes(prefixA) || eA.includes(eB.slice(0, 15))
            );
            if (match) shared.push(eA);
          }
        });

        if (shared.length === 0) return;

        let commonWords = 0;
        ceA.words.forEach(w => { if (ceB.words.has(w)) commonWords++; });
        const questionSimilarity = ceA.words.size > 0 ? commonWords / ceA.words.size : 0;

        const score = Math.min(100, Math.round((shared.length * 30) + (questionSimilarity * 70)));
        if (score < 20) return;

        const key = [ceA.card.id, ceB.card.id].sort().join(":");
        const existing = pairScores.get(key);
        if (!existing || score > existing.score) {
          pairScores.set(key, { a: ceA.card, b: ceB.card, shared, score });
        }
      });
    });
  });

  return Array.from(pairScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(p => ({
      cardA: { id: p.a.id, question: p.a.question, category: p.a.categoryId },
      cardB: { id: p.b.id, question: p.b.question, category: p.b.categoryId },
      sharedErrors: p.shared.slice(0, 3),
      score: p.score,
    }));
}
