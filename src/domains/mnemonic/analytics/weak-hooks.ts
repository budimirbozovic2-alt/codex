// Domain-scoped analytics: WRITES to mnemonic IDB (tags "slaba-kuka"),
// therefore belongs inside the mnemonic domain — NOT in the OLAP layer.
// Pure compute (`calcBlindSpots`) remains under `@/lib/analytics`.
import { loadLatency } from "@/lib/metacognitive-storage";
import { loadMnemonicCards, saveMnemonicCards } from "@/features/mnemonic";

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

  // Pre-group latency by cardId — was O(N×M) via Array.filter inside forEach.
  const latencyByCard = new Map<string, typeof latencyLog>();
  for (const l of latencyLog) {
    const arr = latencyByCard.get(l.cardId);
    if (arr) arr.push(l); else latencyByCard.set(l.cardId, [l]);
  }

  mnemonicCards.forEach(mc => {
    if (mc.mnemonicStatus === "new" && !mc.mnemonicVideo && !mc.acronym) return;

    const cardLatencies = latencyByCard.get(mc.originalCardId);
    if (!cardLatencies || cardLatencies.length < 2) return;

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
