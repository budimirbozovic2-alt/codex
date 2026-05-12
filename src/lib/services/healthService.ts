import { db } from "@/lib/db";
import { getStorageUsage } from "@/lib/storage";

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

const TABLE_DEFS: ReadonlyArray<{ name: string; counter: () => Promise<number> }> = [
  { name: "Kartice",      counter: () => db.cards.count() },
  { name: "Review Log",   counter: () => db.reviewLog.count() },
  { name: "Pomodoro Log", counter: () => db.pomodoroLog.count() },
  { name: "Dnevnik",      counter: () => db.diary.count() },
  { name: "Kalibracija",  counter: () => db.calibrationLog.count() },
  { name: "Latencija",    counter: () => db.latencyLog.count() },
  { name: "Slippage",     counter: () => db.slippageLog.count() },
  { name: "Aktivnosti",   counter: () => db.activityLog.count() },
  { name: "Disciplina",   counter: () => db.disciplineLog.count() },
  { name: "Izvori",       counter: () => db.sources.count() },
  { name: "Mape uma",     counter: () => db.mindMaps.count() },
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
  const [allCards, allCategories] = await Promise.all([
    db.cards.toArray(),
    db.categories.toArray(),
  ]);

  const validIds = new Set(allCategories.map(c => c.id));
  const orphanCards = allCards.filter(c => c.categoryId && !validIds.has(c.categoryId));

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

  const staleSubCards = allCards.filter(c => c.subcategoryId && !subUuids.has(c.subcategoryId));
  const staleChapCards = allCards.filter(c => {
    if (!c.chapterId) return false;
    if (!chapUuids.has(c.chapterId)) return true;
    if (c.subcategoryId && subUuids.has(c.subcategoryId) && chapToSub.get(c.chapterId) !== c.subcategoryId) return true;
    return false;
  });

  return {
    orphans: { count: orphanCards.length, cardIds: orphanCards.map(c => c.id) },
    staleSub: { count: staleSubCards.length, cardIds: staleSubCards.map(c => c.id) },
    staleChap: { count: staleChapCards.length, cardIds: staleChapCards.map(c => c.id) },
  };
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
  const categories = await db.categories.toArray();
  if (categories.length === 0) {
    throw new Error("Nema kategorija za premještanje kartica");
  }
  const fallback = categories[0];
  await Promise.all(
    cardIds.map(id => db.cards.update(id, { categoryId: fallback.id, subcategoryId: "", chapterId: "" }))
  );
  return { fallbackCategoryName: fallback.name, movedCount: cardIds.length };
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
