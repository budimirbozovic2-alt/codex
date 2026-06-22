import type { Card } from "@/lib/spaced-repetition";
import { getCardMasteryLevel } from "@/lib/mastery";
import { getSatelliteFsrsStatus } from "./satellite-fsrs-status";

export interface SagaProgressSummary {
  reads: number;
  /** 0–100 composite mastery across essay + satellites. */
  masteryPct: number;
  leechCount: number;
  dueCount: number;
  satelliteCount: number;
}

export function computeSagaProgress(
  essay: Card,
  satellites: readonly Card[],
  now: number = Date.now(),
): SagaProgressSummary {
  const units = [essay, ...satellites];
  let masterySum = 0;
  let leechCount = 0;
  let dueCount = 0;

  for (const card of units) {
    masterySum += getCardMasteryLevel(card);
    if (card.type === "flash") {
      const status = getSatelliteFsrsStatus(card, now);
      if (status === "leech") leechCount++;
      if (status === "due") dueCount++;
    }
  }

  const masteryPct = units.length === 0
    ? 0
    : Math.round((masterySum / (units.length * 5)) * 100);

  return {
    reads: essay.readCount ?? 0,
    masteryPct,
    leechCount,
    dueCount,
    satelliteCount: satellites.length,
  };
}

export function formatSagaProgressLine(summary: SagaProgressSummary): string {
  const parts: string[] = [
    `${summary.reads} pregleda`,
    `${summary.masteryPct}% savladano`,
  ];
  if (summary.satelliteCount > 0 && summary.leechCount > 0) {
    parts.push(
      `${summary.leechCount} blic bub${summary.leechCount === 1 ? "a" : "e"}`,
    );
  }
  if (summary.satelliteCount > 0 && summary.dueCount > 0) {
    parts.push(`${summary.dueCount} dospjelo`);
  }
  return parts.join(" · ");
}
