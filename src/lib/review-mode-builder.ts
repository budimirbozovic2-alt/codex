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
import { resolveEffectiveSrParams } from "@/domains/subjects/subject-settings";
import type { ReviewMode } from "@/domains/review/types";

export interface DueItem {
  card: Card;
  section: Section;
}

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

export type { BuildArgs };

function modeNow(args: BuildArgs): number {
  return args.now ?? Date.now();
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
  const now = modeNow(args);
  const items: DueItem[] = [];
  for (const card of args.allCards) {
    for (const section of card.sections) {
      if (section.state === SectionState.New) continue;
      if (section.nextReview > now) continue; // strict due-only
      const r = getRetrievability(section, now);
      if (r <= 85) items.push({ card, section });
    }
  }
  items.sort(
    (a, b) => getRetrievability(a.section, now) - getRetrievability(b.section, now),
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
  const now = modeNow(args);
  const leechItems: DueItem[] = [];
  const highDiffItems: DueItem[] = [];

  for (const card of args.allCards) {
    for (const section of card.sections) {
      if (section.state === SectionState.New) continue;
      const effectiveSr = resolveEffectiveSrParams(card.categoryId, args.srSettings).srSettings;
      const sectionLeech = isLeech(section, effectiveSr);
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

/** Section ids already assigned to stabilization / critical / hardest. */
function coveredSectionIds(args: BuildArgs): Set<string> {
  const ids = new Set<string>();
  for (const item of buildStabilizationItems(args)) ids.add(item.section.id);
  for (const item of buildCriticalItems(args)) ids.add(item.section.id);
  for (const item of buildHardestItems(args)) ids.add(item.section.id);
  return ids;
}

/**
 * Catch-up — FSRS-due sections not covered by specialized modes (e.g. Review
 * with R > 85% on schedule). Fills the gap between schedule-due badges and
 * mode-specific filters after legacy imports.
 */
export function buildCatchupItems(args: BuildArgs): DueItem[] {
  const now = modeNow(args);
  const covered = coveredSectionIds(args);
  const items: DueItem[] = [];
  for (const card of args.allCards) {
    for (const section of card.sections) {
      if (section.state === SectionState.New) continue;
      if (section.nextReview > now) continue;
      if (covered.has(section.id)) continue;
      items.push({ card, section });
    }
  }
  items.sort((a, b) => a.section.nextReview - b.section.nextReview);
  return items;
}

/** All consolidation items across modes (unique by section id). */
export function collectConsolidationItems(args: BuildArgs): DueItem[] {
  const seen = new Set<string>();
  const out: DueItem[] = [];
  const builders = [
    buildStabilizationItems,
    buildCriticalItems,
    buildHardestItems,
    buildCatchupItems,
  ] as const;
  for (const build of builders) {
    for (const item of build(args)) {
      if (seen.has(item.section.id)) continue;
      seen.add(item.section.id);
      out.push(item);
    }
  }
  return out;
}

/** Distinct cards with ≥1 consolidation-eligible section. */
export function countConsolidationEligibleCards(args: BuildArgs): number {
  const cardIds = new Set<string>();
  for (const { card } of collectConsolidationItems(args)) {
    cardIds.add(card.id);
  }
  return cardIds.size;
}

export function countConsolidationEligibleByCategory(
  cards: readonly Card[],
  dueCards: readonly Card[],
  srSettings: SRSettings,
  categoryIds: readonly string[],
  now?: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const categoryId of categoryIds) {
    out[categoryId] = countConsolidationEligibleCards({
      dueCards: dueCards.filter((c) => c.categoryId === categoryId),
      allCards: cards.filter((c) => c.categoryId === categoryId),
      srSettings,
      now,
    });
  }
  return out;
}

/** True when any consolidation mode has at least one eligible section. */
export function hasConsolidationWork(args: BuildArgs): boolean {
  return collectConsolidationItems(args).length > 0;
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
    case "catchup":
      return buildCatchupItems(args);
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
