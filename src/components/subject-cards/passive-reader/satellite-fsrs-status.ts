import {
  type Card,
  SectionState,
  isLeech,
  DEFAULT_SR_SETTINGS,
  type SRSettings,
} from "@/lib/spaced-repetition";

export type SatelliteFsrsStatus = "new" | "due" | "leech" | "ok";

export const SATELLITE_FSRS_LABELS: Record<SatelliteFsrsStatus, string> = {
  new: "Nova",
  due: "Dospjelo",
  leech: "Bubu",
  ok: "OK",
};

/** Compact FSRS bucket for a flash satellite (worst section wins). */
export function getSatelliteFsrsStatus(
  card: Card,
  now: number = Date.now(),
  settings: SRSettings = DEFAULT_SR_SETTINGS,
): SatelliteFsrsStatus {
  const sections = card.sections ?? [];
  if (sections.length === 0 || sections.every((s) => s.state === SectionState.New)) {
    return "new";
  }
  if (sections.some((s) => isLeech(s, settings))) return "leech";
  if (sections.some((s) => s.state !== SectionState.New && s.nextReview <= now)) {
    return "due";
  }
  return "ok";
}
