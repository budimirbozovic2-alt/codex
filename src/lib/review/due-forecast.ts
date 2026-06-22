import { startOfDay, addDays, format } from "date-fns";
import {
  type Card,
  SectionState,
} from "@/lib/spaced-repetition";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DueForecastDay {
  dayOffset: number;
  label: string;
  count: number;
}

export interface DueForecastSummary {
  days: DueForecastDay[];
  /** Sum of sections due in the next `horizonDays` days (incl. overdue → today). */
  totalUpcoming: number;
}

/** Anki-style due histogram for the next N calendar days. */
export function buildDueForecast(
  cards: readonly Card[],
  horizonDays: number = 7,
  now: number = Date.now(),
): DueForecastSummary {
  const todayStart = startOfDay(new Date(now)).getTime();
  const days: DueForecastDay[] = Array.from({ length: horizonDays }, (_, i) => {
    const d = addDays(new Date(todayStart), i);
    return {
      dayOffset: i,
      label: i === 0 ? "Danas" : format(d, "EEE d."),
      count: 0,
    };
  });

  for (const card of cards) {
    for (const section of card.sections ?? []) {
      if (section.state === SectionState.New) continue;
      const dueAt = section.nextReview;
      if (dueAt <= todayStart + DAY_MS - 1) {
        days[0]!.count++;
        continue;
      }
      const dayIndex = Math.floor((dueAt - todayStart) / DAY_MS);
      if (dayIndex >= 0 && dayIndex < horizonDays) {
        days[dayIndex]!.count++;
      }
    }
  }

  const totalUpcoming = days.reduce((sum, d) => sum + d.count, 0);
  return { days, totalUpcoming };
}
