// UI-facing constants and human-readable formatters for FSRS state.
import { FrequencyTag, CardSourceType } from "./types";
export const FREQUENCY_TAGS: { value: FrequencyTag; label: string; color: string }[] = [
  { value: "često", label: "Često dolazi", color: "destructive" },
  { value: "rijetko", label: "Rijetko dolazi", color: "warning" },
  { value: "nikad", label: "Gotovo nikad", color: "secondary" },
];

export const SOURCE_TYPES: { value: CardSourceType; label: string }[] = [
  { value: "skripta", label: "Skripta" },
  { value: "zakon", label: "Zakon" },
];

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
