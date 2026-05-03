// UI-facing constants and human-readable formatters for FSRS state.
import { Section, ReviewGrade, FrequencyTag, CardSourceType } from "./types";
import { AdaptiveContext } from "./adaptive";
import { calculateNextReview, getCachedRetention } from "./algorithm";

export const GRADES: ReviewGrade[] = [
  { label: "Opet", value: 1, description: "Potpuno nepoznat odgovor", color: "destructive" },
  { label: "Teško", value: 2, description: "Propuštene ključne info (rokovi, brojevi…)", color: "warning" },
  { label: "Dobro", value: 3, description: "Poznat odgovor + ključne informacije", color: "primary" },
  { label: "Lako", value: 4, description: "1/1 bez oklijevanja", color: "success" },
];

export const FREQUENCY_TAGS: { value: FrequencyTag; label: string; color: string }[] = [
  { value: "često", label: "Često dolazi", color: "destructive" },
  { value: "rijetko", label: "Rijetko dolazi", color: "warning" },
  { value: "nikad", label: "Gotovo nikad", color: "secondary" },
];

export const SOURCE_TYPES: { value: CardSourceType; label: string }[] = [
  { value: "skripta", label: "Skripta" },
  { value: "zakon", label: "Zakon" },
];

/** Canonical tag id stored on `Card.tags` to flag mnemonic-cloned cards. */
export const MNEMONIC_TAG = "mnemonic" as const;

export function formatInterval(interval: number): string {
  if (interval < 1 / 24) {
    // Floor to 1min so sub-30s intervals don't render as "0min".
    return `${Math.max(1, Math.round(interval * 24 * 60))}min`;
  } else if (interval < 1) {
    return `${Math.round(interval * 24)}h`;
  } else if (interval < 30) {
    return `${Math.round(interval)}d`;
  } else if (interval < 365) {
    return `${Math.round(interval / 30)}mj`;
  }
  return `${(interval / 365).toFixed(1)}g`;
}

export function previewIntervals(section: Section, ctx?: AdaptiveContext): Record<number, string> {
  const cachedRetention = getCachedRetention();
  const result: Record<number, string> = {};
  // If the section is being re-graded before its scheduled time (cramming
  // guard active), the algorithm returns only `lastReviewed` — `interval`
  // would be undefined. Show "—" so the UI doesn't suggest a misleading
  // 0-minute schedule.
  for (const grade of [1, 2, 3, 4]) {
    const next = calculateNextReview(section, grade, cachedRetention, ctx);
    result[grade] = next.interval == null ? "—" : formatInterval(next.interval);
  }
  return result;
}
