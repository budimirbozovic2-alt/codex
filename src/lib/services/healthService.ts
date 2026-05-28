import { getStorageUsage } from "@/lib/storage";
import * as cardMapWrites from "@/lib/cards/cardMapWrites";
import {
  // SQLite-primary readers via the backup-readers seam (P1.B).
  countCards,
  countSources,
  countMindMaps,
  countDiscipline,
  countReviewLog,
  countDiary,
  countCalibration,
  countLatency,
  countSlippage,
  countActivity,
  countPomodoro,
  readAllCategoriesForBackup,
  listAllCards,
  getCardsByIds,
  getRecentCorruptCardIds,
} from "@/lib/db/queries";


export interface TableStat {
  name: string;
  count: number;
}

export interface OrphanResult {
  count: number;
  cardIds: string[];
}

export interface CrashEntry {
  label: string;
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}
export interface IntegrityIssues {
  orphans: OrphanResult;
  staleSub: OrphanResult;
  staleChap: OrphanResult;
  /** Card ids that failed to decode from SQLite payload (last 50). */
  corruptCardIds: string[];
}

export interface StorageSnapshot {
  idb: { usage: number; quota: number };
  ls: { usedBytes: number; maxBytes: number; percent: number };
}

export interface HealthReport {
  tableStats: TableStat[];
  storage: StorageSnapshot;
  integrity: IntegrityIssues;
  crashLog: CrashEntry[];
}



// PR-9 A1b P1.B — counters route through the backup-readers seam. Card,
// source, mind-map, and discipline-log counts hit SQLite when the Electron
// shell is up; the remaining log tables stay Dexie-backed until A1c.
const TABLE_DEFS: ReadonlyArray<{ name: string; counter: () => Promise<number> }> = [
  { name: "Kartice",      counter: countCards },
  { name: "Review Log",   counter: countReviewLog },
  { name: "Pomodoro Log", counter: countPomodoro },
  { name: "Dnevnik",      counter: countDiary },
  { name: "Kalibracija",  counter: countCalibration },
  { name: "Latencija",    counter: countLatency },
  { name: "Slippage",     counter: countSlippage },
  { name: "Aktivnosti",   counter: countActivity },
  { name: "Disciplina",   counter: countDiscipline },
  { name: "Izvori",       counter: countSources },
  { name: "Mape uma",     counter: countMindMaps },
];

export async function fetchTableCounts(): Promise<TableStat[]> {
  const counts = await Promise.all(TABLE_DEFS.map(t => t.counter()));
  return TABLE_DEFS.map((t, i) => ({ name: t.name, count: counts[i] }));
}

export async function fetchStorageSnapshot(): Promise<StorageSnapshot> {
  const ls = await getStorageUsage();
  return {
    idb: { usage: ls.usedBytes, quota: ls.maxBytes },
    ls,
  };
}

export async function detectIntegrityIssues(): Promise<IntegrityIssues> {
  // PR-9 A1b P1.B — both reads now flow through the SQLite-primary seam.
  // listAllCards loads the full set once (was a Dexie cursor previously);
  // acceptable trade-off because OPFS SQLite reads are near-sync and the
  // hot path needs the full payload to spot stale chapter/sub links.
  const [allCategories, allCards] = await Promise.all([
    readAllCategoriesForBackup(),
    listAllCards(),
  ]);

  const validIds = new Set(allCategories.map(c => c.id));
  const subUuids = new Set<string>();
  const chapUuids = new Set<string>();
  const chapToSub = new Map<string, string>();

  for (const cat of allCategories) {
    for (const sub of cat.subcategories ?? []) {
      subUuids.add(sub.id);
      for (const ch of sub.chapters ?? []) {
        if (typeof ch === "object" && ch.id) {
          chapUuids.add(ch.id);
          chapToSub.set(ch.id, sub.id);
        }
      }
    }
  }

  const orphanCardIds: string[] = [];
  const staleSubCardIds: string[] = [];
  const staleChapCardIds: string[] = [];

  for (const c of allCards) {
    // 1. Orphans (categoryId missing in validIds)
    if (c.categoryId && !validIds.has(c.categoryId)) {
      orphanCardIds.push(c.id);
    }

    // 2. Stale subcategories
    if (c.subcategoryId && !subUuids.has(c.subcategoryId)) {
      staleSubCardIds.push(c.id);
    }

    // 3. Stale chapters
    if (c.chapterId) {
      let isStale = false;
      if (!chapUuids.has(c.chapterId)) {
        isStale = true;
      } else if (c.subcategoryId && subUuids.has(c.subcategoryId) && chapToSub.get(c.chapterId) !== c.subcategoryId) {
        isStale = true;
      }
      if (isStale) staleChapCardIds.push(c.id);
    }
  }

  return {
    orphans: { count: orphanCardIds.length, cardIds: orphanCardIds },
    staleSub: { count: staleSubCardIds.length, cardIds: staleSubCardIds },
    staleChap: { count: staleChapCardIds.length, cardIds: staleChapCardIds },
    // `listAllCards` above ran `decodeRows`, which logs any decode failures
    // to the cards-repo ring buffer. Snapshot it here so the UI sees the
    // ids that just failed (capped at 50).
    corruptCardIds: getRecentCorruptCardIds(),
  };
}

}

export function loadCrashLog(): CrashEntry[] {
  try {
    const raw = localStorage.getItem("codex-crash-log") || localStorage.getItem("memoria-crash-log");
    return raw ? JSON.parse(raw) as CrashEntry[] : [];
  } catch {
    return [];
  }
}

export function clearCrashLog(): void {
  localStorage.removeItem("codex-crash-log");
  localStorage.removeItem("memoria-crash-log");
}

export interface CleanOrphansResult {
  fallbackCategoryName: string;
  movedCount: number;
}

export async function cleanOrphans(cardIds: string[]): Promise<CleanOrphansResult> {
  const categories = await readAllCategoriesForBackup();
  if (categories.length === 0) {
    throw new Error("Nema kategorija za premještanje kartica");
  }
  const fallback = categories[0];

  // A1c-4 F6: SQLite-primary write. Load the affected cards, mutate the
  // taxonomy fields in JS, then commit through `cardMapWrites.bulkPut` —
  // schedules persistence via persistQueue → SQLite adapter AND updates
  // the in-RAM Zustand mirror in lockstep. No Dexie writes anywhere.
  const loaded = await getCardsByIds(cardIds);
  const patched = loaded
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => ({
      ...c,
      categoryId: fallback.id,
      subcategoryId: "",
      chapterId: "",
    }));
  cardMapWrites.bulkPut(patched);

  return { fallbackCategoryName: fallback.name, movedCount: patched.length };
}

export async function healStaleLinks() {
  const { healCardTaxonomy } = await import("@/lib/migrations/heal-card-taxonomy");
  return healCardTaxonomy(true);
}

export async function buildHealthReport(): Promise<HealthReport> {
  const [tableStats, storage, integrity] = await Promise.all([
    fetchTableCounts(),
    fetchStorageSnapshot(),
    detectIntegrityIssues(),
  ]);
  return {
    tableStats,
    storage,
    integrity,
    crashLog: loadCrashLog(),
  };
}
