import { Card } from "../spaced-repetition";
import { loadCalibration, CalibrationEntry, loadLatency } from "../metacognitive-storage";
import { loadMnemonicCards, MnemonicCard, saveMnemonicCards } from "../mnemonic-storage";

export interface BlindSpot {
  cardId: string;
  sectionId: string;
  question: string;
  category: string;
  confidence: number;
  actualGrade: number;
  occurrences: number;
}

export function calcBlindSpots(cards: Card[]): BlindSpot[] {
  const calibration = loadCalibration();
  if (calibration.length < 5) return [];

  const blindMap = new Map<string, { entries: CalibrationEntry[]; card?: Card }>();

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

export interface WeakHook {
  mnemonicCardId: string;
  originalCardId: string;
  question: string;
  avgLatencyMs: number;
  category: string;
}

export async function calcWeakHooks(): Promise<WeakHook[]> {
  const mnemonicCards = await loadMnemonicCards();
  const latencyLog = loadLatency();
  if (mnemonicCards.length === 0 || latencyLog.length === 0) return [];

  const THRESHOLD = 3000;
  const weakHooks: WeakHook[] = [];

  mnemonicCards.forEach(mc => {
    if (mc.mnemonicStatus === "new" && !mc.mnemonicVideo && !mc.acronym) return;

    const cardLatencies = latencyLog.filter(l => l.cardId === mc.originalCardId);
    if (cardLatencies.length < 2) return;

    const recent = cardLatencies.slice(-5);
    const avgLatency = recent.reduce((s, l) => s + l.latencyMs, 0) / recent.length;

    if (avgLatency > THRESHOLD) {
      weakHooks.push({
        mnemonicCardId: mc.id,
        originalCardId: mc.originalCardId,
        question: mc.question,
        avgLatencyMs: Math.round(avgLatency),
        category: mc.categoryId,
      });

      if (!mc.tags?.includes("slaba-kuka")) {
        mc.tags = [...(mc.tags || []), "slaba-kuka"];
      }
    }
  });

  if (weakHooks.length > 0) {
    await saveMnemonicCards(mnemonicCards);
  }

  return weakHooks;
}
