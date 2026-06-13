// Pure blind-spot detection — needs only Card[] + calibration snapshot.
// (weak-hook tagging is orchestrated by `@/lib/services/weakHooksService` —
// pure compute lives in `@/domains/mnemonic/analytics/weak-hooks`.)
import type { Card } from "../../spaced-repetition";
import type { CalibrationEntry } from "@/domains/metacognition/metacognitive-storage";

export interface BlindSpot {
  cardId: string;
  sectionId: string;
  question: string;
  category: string;
  confidence: number;
  actualGrade: number;
  occurrences: number;
}

export function calcBlindSpots(cards: Card[], calibration: CalibrationEntry[]): BlindSpot[] {
  if (calibration.length < 5) return [];

  const blindMap = new Map<string, { entries: CalibrationEntry[] }>();
  calibration.forEach(e => {
    if (e.confidence >= 4 && e.actualGrade <= 2) {
      const key = `${e.cardId}:${e.sectionId}`;
      const existing = blindMap.get(key) || { entries: [] };
      existing.entries.push(e);
      blindMap.set(key, existing);
    }
  });

  const cardMap = new Map(cards.map(c => [c.id, c]));
  const spots: BlindSpot[] = [];
  blindMap.forEach((data, key) => {
    const [cardId, sectionId] = key.split(":");
    const card = cardMap.get(cardId);
    if (!card) return;
    const latest = data.entries[data.entries.length - 1];
    spots.push({
      cardId,
      sectionId,
      question: card.question,
      category: card.categoryId,
      confidence: latest.confidence,
      actualGrade: latest.actualGrade,
      occurrences: data.entries.length,
    });
  });

  return spots.sort((a, b) => b.occurrences - a.occurrences).slice(0, 15);
}
