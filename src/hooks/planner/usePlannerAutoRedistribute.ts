import { useEffect, useMemo, useState } from "react";
import type { Card as SRCard } from "@/lib/spaced-repetition";
import { hashCards } from "@/lib/query/hash";
type PlannerModule = typeof import("@/domains/planner");
type RedistResult = ReturnType<PlannerModule["autoRedistributeIfNeeded"]>;

let _plannerMod: PlannerModule | null = null;
async function getPlannerModule(): Promise<PlannerModule> {
  if (!_plannerMod) _plannerMod = await import("@/domains/planner");
  return _plannerMod;
}

/**
 * Runs midnight quota redistribution as a mount/update side-effect.
 * Must not run inside `computePlannerSnapshot` (pure, used from useMemo).
 */
export function usePlannerAutoRedistribute(
  cards: SRCard[],
  finalGoalDate: string | null | undefined,
  bufferPercent: number,
): RedistResult {
  const [redistResult, setRedistResult] = useState<RedistResult>(null);
  const cardsHash = useMemo(() => hashCards(cards), [cards]);

  useEffect(() => {
    if (!finalGoalDate) {
      setRedistResult(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const mod = await getPlannerModule();
      const result = mod.autoRedistributeIfNeeded(cards, finalGoalDate, bufferPercent);
      if (!cancelled) setRedistResult(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [cards, cardsHash, finalGoalDate, bufferPercent]);

  return redistResult;
}
