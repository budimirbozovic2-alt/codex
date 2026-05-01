// Single source of truth for selecting items in each consolidation mode.
// Used by both ReviewSetup (for counters/preview) and ReviewSession
// (for resume/auto-mode). Keeping these in lockstep guarantees the
// numbers in the picker match the actual session contents.
//
// Core rule (post-refactor): all modes respect FSRS scheduling.
// A section is only eligible if it is due (`nextReview <= now + grace`).
// This prevents premature reviews from corrupting FSRS stability signals.

import {
  Card,
  Section,
  SRSettings,
  SectionState,
  getDueSections,
  getRetrievability,
  isLeech,
} from "@/lib/spaced-repetition";

export interface DueItem {
  card: Card;
  section: Section;
}

export type ReviewMode = "stabilization" | "critical" | "hardest" | null;

// Grace windows (ms) — how far ahead of `nextReview` a section may be pulled
// into a mode. Stabilization & critical follow the strict FSRS schedule.
// Hardest gets a small slack so users can attack tough cards a bit early.
const DAY_MS = 24 * 60 * 60 * 1000;
export const HARDEST_DIFFICULT_GRACE_MS = 2 * DAY_MS;
export const HARDEST_LEECH_GRACE_MS = 7 * DAY_MS;
export const HARDEST_MAX_ITEMS = 50;

interface BuildArgs {
  dueCards: Card[];
  allCards: Card[];
  srSettings: SRSettings;
  /** Injectable for tests; defaults to Date.now() */
  now?: number;
}

/** Stabilization — fresh / recently lapsed sections with low stability. */
export function buildStabilizationItems(args: BuildArgs): DueItem[] {
  const items: DueItem[] = [];
  for (const card of args.dueCards) {
    for (const section of getDueSections(card)) {
      if (
        (section.state === SectionState.Learning ||
          section.state === SectionState.Relearning) &&
        section.stability < 5
      ) {
        items.push({ card, section });
      }
    }
  }
  items.sort((a, b) => a.section.stability - b.section.stability);
  return items;
}

/**
 * Critical review — catch-all for any DUE section whose retrievability has
 * dropped to ≤85%. This includes the "optimal forgetting" window (R≈80–85)
 * AND every section that drifted lower (R<80) because the user missed days.
 * Without the catch-all, low-R cards become "zombies": not Learning, not
 * Leeches, never picked up by any mode. Sorted worst-R first so the most
 * urgent items lead.
 */
export function buildCriticalItems(args: BuildArgs): DueItem[] {
  const now = args.now ?? Date.now();
  const items: DueItem[] = [];
  for (const card of args.allCards) {
    for (const section of card.sections) {
      if (section.state === SectionState.New) continue;
      if (section.nextReview > now) continue; // strict due-only
      const r = getRetrievability(section);
      if (r <= 85) items.push({ card, section });
    }
  }
  items.sort(
    (a, b) => getRetrievability(a.section) - getRetrievability(b.section),
  );
  return items;
}

/**
 * Hardest — leech (lapses ≥ threshold) and high-difficulty (>7) sections.
 * Leeches get a 7-day grace window (users want to forge through them);
 * difficult-but-not-leech sections get a 2-day grace window.
 * Sections far in the future are excluded to protect FSRS scheduling.
 */
export function buildHardestItems(args: BuildArgs): DueItem[] {
  const now = args.now ?? Date.now();
  const leechItems: DueItem[] = [];
  const highDiffItems: DueItem[] = [];

  for (const card of args.allCards) {
    for (const section of card.sections) {
      if (section.state === SectionState.New) continue;
      const sectionLeech = isLeech(section, args.srSettings);
      if (sectionLeech) {
        if (section.nextReview <= now + HARDEST_LEECH_GRACE_MS) {
          leechItems.push({ card, section });
        }
      } else if (section.difficulty > 7) {
        if (section.nextReview <= now + HARDEST_DIFFICULT_GRACE_MS) {
          highDiffItems.push({ card, section });
        }
      }
    }
  }

  highDiffItems.sort((a, b) => b.section.difficulty - a.section.difficulty);
  const combined: DueItem[] = [...leechItems];
  const remaining = HARDEST_MAX_ITEMS - combined.length;
  if (remaining > 0) combined.push(...highDiffItems.slice(0, remaining));
  return combined.slice(0, HARDEST_MAX_ITEMS);
}

/** Dispatcher used by ReviewSession (resume + autoMode). */
export function buildItemsForMode(
  mode: Exclude<ReviewMode, null>,
  args: BuildArgs,
): DueItem[] {
  switch (mode) {
    case "stabilization":
      return buildStabilizationItems(args);
    case "critical":
      return buildCriticalItems(args);
    case "hardest":
      return buildHardestItems(args);
  }
}

/**
 * Helper: is a given section eligible at the moment shown?
 * Used by ReviewCard to render an "early review" hint when the user
 * is consolidating a section before its FSRS-scheduled time.
 */
export function isEarlyReview(section: Section, now: number = Date.now()): boolean {
  return section.state !== SectionState.New && section.nextReview > now;
}
