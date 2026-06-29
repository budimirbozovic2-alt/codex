import { getBrowserStorageEstimate } from "@/lib/services/browser-storage-estimate";
import { cardRepository } from "@/lib/repositories";
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


// Internal shapes — composed into the only exported type (HealthReport).
// Knip flagged these as unused public exports; dropping `export` keeps the
// definitions local without disturbing their consumers below.
interface TableStat {
  name: string;
  count: number;
}

interface OrphanResult {
  count: number;
  cardIds: string[];
}

interface CrashEntry {
  label: string;
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}
interface IntegrityIssues {
  orphans: OrphanResult;
  staleSub: OrphanResult;
  staleChap: OrphanResult;
  /** Card ids that failed to decode from SQLite payload (last 50). */
  corruptCardIds: string[];
}

interface StorageSnapshot {
  idb: { usage: number; quota: number };
  ls: { usedBytes: number; maxBytes: number; percent: number };
}

export interface HealthReport {
  tableStats: TableStat[];
  storage: StorageSnapshot;
  integrity: IntegrityIssues;
  crashLog: CrashEntry[];
}



// A1c-4 F1+: counters route through the backup-readers seam — all SQLite-primary.
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

async function fetchTableCounts(): Promise<TableStat[]> {
  const counts = await Promise.all(TABLE_DEFS.map(t => t.counter()));
  return TABLE_DEFS.map((t, i) => ({ name: t.name, count: counts[i] }));
}

async function fetchStorageSnapshot(): Promise<StorageSnapshot> {
  const ls = await getBrowserStorageEstimate();
  return {
    idb: { usage: ls.usedBytes, quota: ls.maxBytes },
    ls,
  };
}

async function detectIntegrityIssues(): Promise<IntegrityIssues> {
  // Both reads flow through the SQLite-primary seam. listAllCards loads the
  // full set once; acceptable for integrity heal on main-process SQLite.
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



function loadCrashLog(): CrashEntry[] {
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

  // taxonomy fields in JS, then commit through `cardRepository.bulkPutAuthoritative` —
  // schedules persistence via persistQueue → SQLite adapter and emits
  // `notifyCardsChanged` so the TanStack bridge invalidates `['cards']`.
  // Legacy `cardMapWrites` RAM mirror was deleted in PR-E.
  const loaded = await getCardsByIds(cardIds);
  const patched = loaded
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => ({
      ...c,
      categoryId: fallback.id,
      subcategoryId: "",
      chapterId: "",
    }));
  await cardRepository.bulkPutAuthoritative(patched);

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
