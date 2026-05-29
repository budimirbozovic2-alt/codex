import { useMemo } from "react";
import { type Card, SectionState, getCardRetrievability } from "@/lib/spaced-repetition";

export interface CardStats {
  reads: number;
  lapses: number;
  avgStability: number;
  retention: number;
  allNew: boolean;
}

export function useCardStats(current: Card | undefined): CardStats | null {
  return useMemo(() => {
    if (!current) return null;
    const sections = current.sections ?? [];
    const reviewed = sections.filter(s => s.state !== SectionState.New);
    const allNew = sections.length > 0 && reviewed.length === 0;
    const lapses = sections.reduce((sum, s) => sum + (s.lapses ?? 0), 0);
    const avgStability = reviewed.length === 0
      ? 0
      : reviewed.reduce((sum, s) => sum + (s.stability ?? 0), 0) / reviewed.length;
    return {
      reads: current.readCount ?? 0,
      lapses,
      avgStability,
      retention: getCardRetrievability(current),
      allNew,
    };
  }, [current]);
}
