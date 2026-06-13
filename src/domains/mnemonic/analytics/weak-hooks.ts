// Pure weak-hook analytics — no I/O, no feature imports.
// Orchestration (load + persist) lives in `@/lib/services/weakHooksService`.

/** Minimal mnemonic card shape required by weak-hook analytics. */
export interface WeakHookMnemonicInput {
  id: string;
  originalCardId: string;
  question: string;
  categoryId: string;
  mnemonicStatus: string;
  mnemonicVideo: string;
  acronym: string;
  tags?: string[];
}

export interface WeakHookLatencyInput {
  cardId: string;
  latencyMs: number;
}

export interface WeakHook {
  mnemonicCardId: string;
  originalCardId: string;
  question: string;
  avgLatencyMs: number;
  category: string;
}

const WEAK_HOOK_THRESHOLD_MS = 3000;
const WEAK_HOOK_TAG = "slaba-kuka";

export interface CalcWeakHooksResult<T extends WeakHookMnemonicInput> {
  weakHooks: WeakHook[];
  /** Full card list with tags applied when any weak hooks were found; otherwise null. */
  updatedCards: T[] | null;
}

export function calcWeakHooks<T extends WeakHookMnemonicInput>(
  mnemonicCards: readonly T[],
  latencyLog: readonly WeakHookLatencyInput[],
): CalcWeakHooksResult<T> {
  if (mnemonicCards.length === 0 || latencyLog.length === 0) {
    return { weakHooks: [], updatedCards: null };
  }

  const weakHooks: WeakHook[] = [];

  const latencyByCard = new Map<string, WeakHookLatencyInput[]>();
  for (const l of latencyLog) {
    const arr = latencyByCard.get(l.cardId);
    if (arr) arr.push(l);
    else latencyByCard.set(l.cardId, [l]);
  }

  let hasTagUpdates = false;
  const updatedCards = mnemonicCards.map((mc) => {
    if (mc.mnemonicStatus === "new" && !mc.mnemonicVideo && !mc.acronym) return mc;

    const cardLatencies = latencyByCard.get(mc.originalCardId);
    if (!cardLatencies || cardLatencies.length < 2) return mc;

    const recent = cardLatencies.slice(-5);
    const avgLatency =
      recent.reduce((s, l) => s + l.latencyMs, 0) / recent.length;

    if (avgLatency <= WEAK_HOOK_THRESHOLD_MS) return mc;

    weakHooks.push({
      mnemonicCardId: mc.id,
      originalCardId: mc.originalCardId,
      question: mc.question,
      avgLatencyMs: Math.round(avgLatency),
      category: mc.categoryId,
    });

    if (mc.tags?.includes(WEAK_HOOK_TAG)) return mc;

    hasTagUpdates = true;
    return { ...mc, tags: [...(mc.tags || []), WEAK_HOOK_TAG] };
  });

  return {
    weakHooks,
    updatedCards: weakHooks.length > 0 && hasTagUpdates ? updatedCards : null,
  };
}
