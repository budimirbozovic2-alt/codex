// Thin adapter — pulls calibration snapshot from main-thread storage and
// delegates to `_pure/blind-spots.ts`. `calcWeakHooks` stays here because
// it WRITES to IDB (mnemonic cards) and is therefore not OLAP.
import { Card } from "../spaced-repetition";
import { loadCalibration, loadLatency } from "../metacognitive-storage";
import { loadMnemonicCards, saveMnemonicCards } from "@/features/mnemonic";
import { calcBlindSpots as calcBlindSpotsPure, type BlindSpot } from "./_pure/blind-spots";

export type { BlindSpot };

export function calcBlindSpots(cards: Card[]): BlindSpot[] {
  return calcBlindSpotsPure(cards, loadCalibration());
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
