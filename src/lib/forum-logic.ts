/**
 * Forum Iustitiae — Monument Logic
 *
 * Derives the "state of the Forum" from FSRS card data.
 * Pure functions, no side effects, no React imports.
 */
import { Card, SectionState } from "./spaced-repetition";
import {
  loadSourceRegistry,
  buildAliasMap,
  buildSourceMap,
  resolveMasterSource,
  type MasterSourceInfo,
} from "./source-registry";
import type { Source } from "./db";

// ─── Types ──────────────────────────────────────────────

export type ConstructionPhase = "foundation" | "skeleton" | "construction" | "complete" | "imperial";

/** Backward-compatible alias — all downstream consumers keep working */
export type MaterialTier = ConstructionPhase;

export type BuildingType =
  | "amphitheatrum" | "basilica" | "tabularium" | "rostra"
  | "curia" | "macellum" | "argentaria" | "templum" | "arcus"
  | "insula";

const MONUMENT_TYPES_KEY = "codex-monument-types";

// In-memory cache — avoids repeated JSON.parse in render loops
let _monumentTypesCache: Record<string, BuildingType> | null = null;

export function loadMonumentTypes(): Record<string, BuildingType> {
  if (_monumentTypesCache) return _monumentTypesCache;
  try {
    const raw = localStorage.getItem(MONUMENT_TYPES_KEY);
    _monumentTypesCache = raw ? JSON.parse(raw) : {};
  } catch { _monumentTypesCache = {}; }
  return _monumentTypesCache!;
}

export function saveMonumentType(category: string, type: BuildingType) {
  const current = loadMonumentTypes();
  current[category] = type;
  _monumentTypesCache = current;
  localStorage.setItem(MONUMENT_TYPES_KEY, JSON.stringify(current));
}

/** Invalidate cache (e.g. after external import) */
export function invalidateMonumentTypesCache() {
  _monumentTypesCache = null;
  _mtHashCache = null;
}

// ─── Construction Phase Logic ───────────────────────────

function getConstructionPhase(mastery: number): ConstructionPhase {
  if (mastery >= 91) return "imperial";
  if (mastery >= 61) return "complete";
  if (mastery >= 31) return "construction";
  if (mastery >= 11) return "skeleton";
  return "foundation";
}

/** @deprecated Use getConstructionPhase — kept for backward compat */
const getMaterialTier = getConstructionPhase;

export interface MonumentSourceBreakdown {
  masterSource: string;
  cardCount: number;
  mastery: number;
}

export interface Monument {
  category: string;
  totalCards: number;
  masteredCards: number;
  mastery: number;
  material: ConstructionPhase;
  avgStability: number;
  avgDifficulty: number;
  leechCount: number;
  crumbling: boolean;
  buildingType: BuildingType;
  sources?: MonumentSourceBreakdown[];
}

export interface ForumState {
  monuments: Monument[];
  overallMastery: number;
  velocity: number;
  dayPhase: number;
  warmth: number;
}

// ─── Monument Calculator ────────────────────────────────

interface MonumentResult {
  monument: Monument;
  totalSections: number;
  reviewSections: number;
}

function buildMonument(category: string, cards: Card[]): MonumentResult {
  if (cards.length === 0) {
    return {
      monument: {
        category, totalCards: 0, masteredCards: 0, mastery: 0,
        material: "foundation", avgStability: 0, avgDifficulty: 5,
        leechCount: 0, crumbling: false, buildingType: "insula",
      },
      totalSections: 0,
      reviewSections: 0,
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
    monument: {
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
    },
    totalSections,
    reviewSections,
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

// ─── Fingerprint cache for O(1) skip when data unchanged ────
let _cachedFingerprint = "";
let _cachedForumState: ForumState | null = null;

// H3 fix v2: Cache monument types hash; invalidate on load AND on save
let _mtHashCache: string | null = null;
let _mtHashSource: string | null = null;

function getMonumentTypesHash(): string {
  // Re-derive hash if underlying localStorage changed (covers import/external tab edits)
  const rawLS = typeof localStorage !== "undefined" ? (localStorage.getItem("codex-monument-types") || "") : "";
  if (_mtHashCache === null || _mtHashSource !== rawLS) {
    _mtHashSource = rawLS;
    _mtHashCache = String(rawLS.length) + ":" + (rawLS.length > 0 ? rawLS.slice(0, 64) : "empty");
  }
  return _mtHashCache;
}

/** Build a lightweight fingerprint from card states to detect real changes */
function buildFingerprint(cards: Card[], reviewLogLen: number, sourceCount: number, registryVersion = 0): string {
  let reviewSections = 0;
  let totalSections = 0;
  let stabilitySum = 0;
  for (const card of cards) {
    for (const sec of card.sections) {
      totalSections++;
      if (sec.state === SectionState.Review) reviewSections++;
      stabilitySum += sec.stability;
    }
  }
  const mtHash = getMonumentTypesHash();
  return `${cards.length}:${totalSections}:${reviewSections}:${Math.round(stabilitySum)}:${reviewLogLen}:${sourceCount}:${registryVersion}:${mtHash}`;
}

// ─── Main Calculator ────────────────────────────────────

export function calculateForumState(
  cards: Card[],
  reviewLog: ReviewEntry[],
  allSources?: Source[],
  registryVersion = 0,
): ForumState {
  // B2: Skip full O(n*s) rebuild if fingerprint matches
  const fp = buildFingerprint(cards, reviewLog.length, allSources?.length ?? 0, registryVersion);
  if (fp === _cachedFingerprint && _cachedForumState) {
    return _cachedForumState;
  }

  // Group cards by category
  const byCategory = new Map<string, Card[]>();
  for (const card of cards) {
    const cat = card.category || "Nekategorizovano";
    const arr = byCategory.get(cat);
    if (arr) arr.push(card);
    else byCategory.set(cat, [card]);
  }

  const monumentTypes = loadMonumentTypes();

  // Source registry for optional breakdown
  let sourceMap: Map<string, Source> | null = null;
  let aliasMap: Map<string, string> | null = null;
  if (allSources && allSources.length > 0) {
    const registry = loadSourceRegistry();
    aliasMap = buildAliasMap(registry);
    sourceMap = buildSourceMap(allSources);
  }

  const monuments: Monument[] = [];
  // B4 fix: accumulate overall totals during monument building (eliminates third pass)
  let grandTotalSections = 0;
  let grandTotalReview = 0;
  for (const [cat, catCards] of byCategory) {
    const result = buildMonument(cat, catCards);
    const m = result.monument;
    grandTotalSections += result.totalSections;
    grandTotalReview += result.reviewSections;
    m.buildingType = monumentTypes[cat] || "insula";

    // Add source breakdown if sources available
    if (sourceMap && aliasMap) {
      const srcGroups = new Map<string, { count: number; reviewSections: number; totalSections: number }>();
      for (const card of catCards) {
        const master = card.sourceId && sourceMap.get(card.sourceId)
          ? resolveMasterSource(sourceMap.get(card.sourceId)!.label, aliasMap)
          : "Bez izvora";
        if (!srcGroups.has(master)) srcGroups.set(master, { count: 0, reviewSections: 0, totalSections: 0 });
        const g = srcGroups.get(master)!;
        g.count++;
        for (const sec of card.sections) {
          g.totalSections++;
          if (sec.state === SectionState.Review) g.reviewSections++;
        }
      }
      m.sources = Array.from(srcGroups.entries()).map(([ms, g]) => ({
        masterSource: ms,
        cardCount: g.count,
        mastery: g.totalSections > 0 ? Math.round((g.reviewSections / g.totalSections) * 1000) / 10 : 0,
      }));
    }

    monuments.push(m);
  }

  // Sort: highest mastery first
  monuments.sort((a, b) => b.mastery - a.mastery);

  const overallMastery = grandTotalSections > 0
    ? Math.round((grandTotalReview / grandTotalSections) * 1000) / 10
    : 0;

  const velocity = calcVelocity(reviewLog);

  const result: ForumState = {
    monuments,
    overallMastery,
    velocity,
    dayPhase: getDayPhase(),
    warmth: calcWarmth(velocity),
  };

  _cachedFingerprint = fp;
  _cachedForumState = result;
  return result;
}

// ─── Phase Display Helpers ──────────────────────────────

export const PHASE_LABELS: Record<ConstructionPhase, string> = {
  foundation: "Temelji",
  skeleton: "Skele",
  construction: "Građenje",
  complete: "Kompletna",
  imperial: "Imperijalna",
};

export const PHASE_ICONS: Record<ConstructionPhase, string> = {
  foundation: "",
  skeleton: "",
  construction: "",
  complete: "",
  imperial: "",
};
