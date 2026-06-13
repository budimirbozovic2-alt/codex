// Adaptive scheduling modifiers — adjusts FSRS scheduling based on card metadata
// (frequencyTag, sourceType) and examiner profile. Pure function; no I/O.
import type { ExaminerProfile, FrequencyTag, CardSourceType } from "./types";

export interface AdaptiveContext {
  frequencyTag?: FrequencyTag;
  sourceType?: CardSourceType;
  examinerProfile?: ExaminerProfile;
}

interface AdaptiveReason {
  code:
    | "FREQ_CESTO" | "FREQ_RIJETKO" | "FREQ_NIKAD"
    | "EXAM_PREF_MATCH_ESEJ" | "EXAM_PREF_MATCH_DEFINICIJA" | "EXAM_PREF_MATCH_POTPITANJA"
    | "EXAM_DIFF_TEZAK" | "EXAM_DIFF_LAK";
  label: string;
  retentionDelta: number;
  intervalFactor: number;
}

export interface AdaptiveModifiers {
  retentionBoost: number;     // added to targetRetention
  intervalMultiplier: number; // multiplied with calculated interval
  reasons: AdaptiveReason[];  // human-readable explanation of every applied rule
}

export const RETENTION_MIN = 0.80;
export const RETENTION_MAX = 0.98;
const RETENTION_BOOST_LIMIT = 0.05; // ±5pp absolute cap on combined adaptive boost
const INTERVAL_MULT_MIN = 0.5;
const INTERVAL_MULT_MAX = 1.5;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeAdaptiveModifiers(ctx?: AdaptiveContext): AdaptiveModifiers {
  if (!ctx || (ctx.frequencyTag === undefined && ctx.sourceType === undefined && ctx.examinerProfile === undefined)) {
    return { retentionBoost: 0, intervalMultiplier: 1, reasons: [] };
  }

  let retentionBoost = 0;
  let intervalMultiplier = 1;
  const reasons: AdaptiveReason[] = [];

  const apply = (
    code: AdaptiveReason["code"],
    label: string,
    rDelta: number,
    iFactor: number,
  ) => {
    retentionBoost += rDelta;
    intervalMultiplier *= iFactor;
    reasons.push({ code, label, retentionDelta: rDelta, intervalFactor: iFactor });
  };

  // Frequency tag — highest priority signal
  switch (ctx.frequencyTag) {
    case "često":
      apply("FREQ_CESTO", "Često se pita — čuva se češće", 0.03, 0.80);
      break;
    case "rijetko":
      apply("FREQ_RIJETKO", "Rijetko se pita — manje često", -0.02, 1.15);
      break;
    case "nikad":
      apply("FREQ_NIKAD", "Nikad se ne pita — najduže", -0.04, 1.30);
      break;
  }

  // Examiner preference × source type matching
  const pref = ctx.examinerProfile?.preferredAnswerType;
  const src = ctx.sourceType;
  if (pref === "esej" && src === "skripta") {
    apply("EXAM_PREF_MATCH_ESEJ", "Ispitivač voli eseje + skripta izvor", 0.02, 0.90);
  } else if (pref === "definicija" && src === "zakon") {
    apply("EXAM_PREF_MATCH_DEFINICIJA", "Ispitivač voli definicije + zakon", 0.02, 0.90);
  } else if (pref === "potpitanja" && (src === "skripta" || src === "zakon")) {
    apply("EXAM_PREF_MATCH_POTPITANJA", "Ispitivač voli potpitanja", 0.01, 0.95);
  }

  // Examiner difficulty bias
  switch (ctx.examinerProfile?.difficulty) {
    case "tezak":
      apply("EXAM_DIFF_TEZAK", "Težak ispitivač — viša retencija", 0.01, 0.95);
      break;
    case "lak":
      apply("EXAM_DIFF_LAK", "Lak ispitivač — niža retencija", -0.01, 1.05);
      break;
  }

  return {
    retentionBoost: clamp(retentionBoost, -RETENTION_BOOST_LIMIT, RETENTION_BOOST_LIMIT),
    intervalMultiplier: clamp(intervalMultiplier, INTERVAL_MULT_MIN, INTERVAL_MULT_MAX),
    reasons,
  };
}
