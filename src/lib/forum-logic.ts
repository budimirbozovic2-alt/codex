/**
 * Forum Iustitiae — Monument Logic
 *
 * Derives the "state of the Forum" from FSRS card data.
 * Pure functions, no side effects, no React imports.
 */
import { Card, SectionState } from "./spaced-repetition";

// ─── Types ──────────────────────────────────────────────

export type MaterialTier = "wood" | "brick" | "stone" | "marble" | "gold";

export type BuildingType =
  | "amphitheatrum" | "basilica" | "tabularium" | "rostra"
  | "curia" | "macellum" | "argentaria" | "templum" | "arcus"
  | "insula";

const MONUMENT_TYPES_KEY = "codex-monument-types";

export function loadMonumentTypes(): Record<string, BuildingType> {
  try {
    const raw = localStorage.getItem(MONUMENT_TYPES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveMonumentType(category: string, type: BuildingType) {
  const current = loadMonumentTypes();
  current[category] = type;
  localStorage.setItem(MONUMENT_TYPES_KEY, JSON.stringify(current));
}

export interface Monument {
  category: string;
  totalCards: number;
  masteredCards: number;
  mastery: number;
  material: MaterialTier;
  avgStability: number;
  avgDifficulty: number;
  leechCount: number;
  crumbling: boolean;
  /** User-chosen building type (or "insula" fallback) */
  buildingType: BuildingType;
}

export interface ForumState {
  monuments: Monument[];
  /** Overall mastery across all cards (0-100) */
  overallMastery: number;
  /** Learning velocity: reviews in last 7 days */
  velocity: number;
  /** Time-of-day phase for atmosphere (0-1, derived from hour) */
  dayPhase: number;
  /** Atmosphere warmth (0-1) based on velocity — higher velocity = warmer/sunnier */
  warmth: number;
}

// ─── Material Tier Logic ────────────────────────────────

function getMaterialTier(mastery: number): MaterialTier {
  if (mastery >= 95) return "gold";
  if (mastery >= 80) return "marble";
  if (mastery >= 60) return "stone";
  if (mastery >= 30) return "brick";
  return "wood";
}

// ─── Monument Calculator ────────────────────────────────

function buildMonument(category: string, cards: Card[]): Monument {
  if (cards.length === 0) {
    return {
      category, totalCards: 0, masteredCards: 0, mastery: 0,
      material: "wood", avgStability: 0, avgDifficulty: 5,
      leechCount: 0, crumbling: false, buildingType: "insula",
    };
  }

  let totalSections = 0;
  let reviewSections = 0;
  let stabilitySum = 0;
  let difficultySum = 0;
  let leechCount = 0;
  let masteredCards = 0;

  for (const card of cards) {
    const sections = card.sections;
    if (sections.length === 0) continue;

    let allReview = true;
    for (const sec of sections) {
      totalSections++;
      stabilitySum += sec.stability;
      difficultySum += sec.difficulty;

      if (sec.state === SectionState.Review) {
        reviewSections++;
      } else {
        allReview = false;
      }

      if (sec.lapses >= 5) leechCount++;
    }

    if (allReview) masteredCards++;
  }

  const mastery = totalSections > 0 ? (reviewSections / totalSections) * 100 : 0;
  const avgStability = totalSections > 0 ? stabilitySum / totalSections : 0;
  const avgDifficulty = totalSections > 0 ? difficultySum / totalSections : 5;
  const crumbling = totalSections > 0 && (leechCount / totalSections) > 0.2;

  return {
    category,
    totalCards: cards.length,
    masteredCards,
    mastery: Math.round(mastery * 10) / 10,
    material: getMaterialTier(mastery),
    avgStability: Math.round(avgStability * 10) / 10,
    avgDifficulty: Math.round(avgDifficulty * 10) / 10,
    leechCount,
    crumbling,
    buildingType: "insula",
  };
}

// ─── Day/Night Phase ────────────────────────────────────

/** Returns 0-1 where 0 = midnight, 0.5 = noon, 1 = next midnight */
function getDayPhase(): number {
  const now = new Date();
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
  return minutesSinceMidnight / 1440;
}

// ─── Velocity & Warmth ──────────────────────────────────

interface ReviewEntry {
  timestamp: number;
}

function calcVelocity(reviewLog: ReviewEntry[]): number {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return reviewLog.filter(e => e.timestamp >= weekAgo).length;
}

/** Maps velocity to warmth 0-1 (0 = cold/inactive, 1 = very active) */
function calcWarmth(velocity: number): number {
  // 0 reviews → 0, 100+ reviews → 1
  return Math.min(1, velocity / 100);
}

// ─── Main Calculator ────────────────────────────────────

export function calculateForumState(
  cards: Card[],
  reviewLog: ReviewEntry[],
): ForumState {
  // Group cards by category
  const byCategory = new Map<string, Card[]>();
  for (const card of cards) {
    const cat = card.category || "Nekategorizovano";
    const arr = byCategory.get(cat);
    if (arr) arr.push(card);
    else byCategory.set(cat, [card]);
  }

  const monumentTypes = loadMonumentTypes();

  const monuments: Monument[] = [];
  for (const [cat, catCards] of byCategory) {
    const m = buildMonument(cat, catCards);
    m.buildingType = monumentTypes[cat] || "insula";
    monuments.push(m);
  }

  // Sort: highest mastery first
  monuments.sort((a, b) => b.mastery - a.mastery);

  // Overall mastery
  let totalSections = 0;
  let totalReview = 0;

  for (const card of cards) {
    for (const sec of card.sections) {
      totalSections++;
      if (sec.state === SectionState.Review) totalReview++;
    }
  }

  const overallMastery = totalSections > 0
    ? Math.round((totalReview / totalSections) * 1000) / 10
    : 0;

  const velocity = calcVelocity(reviewLog);

  return {
    monuments,
    overallMastery,
    velocity,
    dayPhase: getDayPhase(),
    warmth: calcWarmth(velocity),
  };
}

// ─── Material Display Helpers ───────────────────────────

export const MATERIAL_LABELS: Record<MaterialTier, string> = {
  wood: "Lignum",       // Wood
  brick: "Laterīcius",  // Brick
  stone: "Lapis",       // Stone
  marble: "Marmor",     // Marble
  gold: "Aurum",        // Gold
};

export const MATERIAL_ICONS: Record<MaterialTier, string> = {
  wood: "🪵",
  brick: "🧱",
  stone: "🪨",
  marble: "🏛️",
  gold: "✨",
};
