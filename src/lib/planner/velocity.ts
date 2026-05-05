/** Velocity, finish projection, and human-readable projection text. */
import { addDays, differenceInDays, startOfDay } from "date-fns";
import type { ReviewLogEntry } from "../storage";
import { calcRebalancedQuota } from "./suggestions";

export function calcVelocity(reviewLog: ReviewLogEntry[], days: number = 7): number {
  const cutoff = startOfDay(addDays(new Date(), -days)).getTime();
  const now = Date.now();
  const sectionFirstSeen = new Map<string, number>();
  reviewLog.forEach((e) => {
    const key = `${e.cardId}:${e.sectionId}`;
    const prev = sectionFirstSeen.get(key);
    if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
  });
  let newInWindow = 0;
  sectionFirstSeen.forEach((ts) => { if (ts >= cutoff && ts <= now) newInWindow++; });
  return days > 0 ? newInWindow / days : 0;
}

export function calcEstimatedFinish(remaining: number, velocity: number): Date | null {
  if (velocity <= 0 || remaining <= 0) return remaining <= 0 ? new Date() : null;
  return addDays(new Date(), Math.ceil(remaining / velocity));
}

export function getProjectionText(
  velocity: number, remaining: number, goalDateStr: string | null, bufferPct: number,
): string {
  if (velocity <= 0) return "Nema dovoljno podataka za projekciju. Nastavi sa učenjem.";
  const finish = calcEstimatedFinish(remaining, velocity);
  if (!finish) return "Sve cjeline su savladane!";
  if (!goalDateStr) return `Sa trenutnim tempom, završićeš bazu dana ${finish.toLocaleDateString("sr-Latn")}.`;
  const goal = new Date(goalDateStr);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (bufferPct / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const diff = differenceInDays(finish, effectiveGoal);
  if (diff <= 0) {
    return `Sa tvojim trenutnim tempom (zadnjih 7 dana), završićeš bazu dana ${finish.toLocaleDateString("sr-Latn")}. To je ${Math.abs(diff)} dana prije tvog cilja.`;
  }
  return `Sa tvojim trenutnim tempom (zadnjih 7 dana), završićeš bazu dana ${finish.toLocaleDateString("sr-Latn")}. To je ${diff} dana poslije tvog cilja.`;
}

// Re-export so existing callers can keep importing from one place.
export { calcRebalancedQuota };
