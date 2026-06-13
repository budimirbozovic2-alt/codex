// ─────────────────────────────────────────────────────────────────────────────
// Motion tokens — disciplinovan motion sistem
//
// Single source of truth za sve durations, easings, staggers. Svaka animacija
// u aplikaciji bira iz ovih konstanti. Pojedinačni `duration: 0.27` brojevi
// nisu dozvoljeni — ako trebaš novu vrijednost, dodaj je ovdje sa opravdanjem.
//
// Trajanja preko 240ms zahtijevaju komentar iznad use-sitea. Preko 400ms je
// zabranjeno — premium se ne osjeća kao spor PowerPoint.
// ─────────────────────────────────────────────────────────────────────────────

export const DURATION = {
  /** Mikro-interakcija (hover lift, focus ring, color tween) */
  instant: 0.12,
  /** Toast, popover, tooltip, dropdown */
  fast: 0.18,
  /** Page transition, modal open, primarni reveal */
  base: 0.22,
  /** Layout shift, FSRS card flip, panel collapse */
  slow: 0.32,
} as const;

export const EASE = {
  /** Standardno izlaženje — koristi za 90% animacija */
  out: [0.22, 0.61, 0.36, 1] as const,
  /** Ulaženje (rijetko — uglavnom za exit phase) */
  in: [0.42, 0, 0.58, 1] as const,
  /** Spring za drag drop i fizičke interakcije */
  spring: { type: "spring" as const, stiffness: 360, damping: 30 },
} as const;

/** Translate u px za FadeUp ulazak — namjerno mali, "premium" je suzdržan */
export const TRANSLATE_PX = 6;
