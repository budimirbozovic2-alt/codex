/**
 * Shared in-memory cache + serialized IDB write queue for planner storage.
 *
 * Why a single module:
 * - All planner sub-modules (config, discipline, daily-mapped, redistribute)
 *   read/write the same four IDB keys. Centralizing the cache here keeps
 *   `loadPlanner`, `loadDisciplineLog`, etc. as O(1) sync getters.
 * - `enqueueWrite` chains every write through one promise so a slow earlier
 *   put can't be overwritten by a stale later put (Lost Update prevention).
 *   Callers mutate the cache SYNCHRONOUSLY before enqueueing the IDB op
 *   (Ref-Delta pattern), so UI stays responsive.
 */
import { db } from "../db";
import type { PlannerConfig, StudyDecade, DisciplineEntry } from "./types";
import { DEFAULT_CONFIG } from "./types";

import { createKeyedMutex } from "@/lib/concurrency";
import { logger } from "@/lib/logger";


interface DailyMappedSlot {
  date: string;
  count: number;
}

// ─── State ───────────────────────────────────────────────
let _plannerCache: PlannerConfig = { ...DEFAULT_CONFIG, createdAt: Date.now() };
let _disciplineCache: DisciplineEntry[] = [];
let _dailyMapped: DailyMappedSlot = { date: "", count: 0 };
let _lastRedistributeDate: string = "";

// ─── Mutex ───────────────────────────────────────────────
const _mutex = createKeyedMutex();
export function enqueueWrite(label: string, op: () => Promise<unknown>): void {
  // Fire-and-forget; greške loguje sam mutex preko label-a.
  void _mutex.runExclusive(null, () => op().then(() => undefined), `planner:${label}`);
}


// ─── Change emitter (PR-7f M1 — TanStack bridge) ─────────
export type PlannerChangeKind =
  | "config"
  | "discipline"
  | "dailyMapped"
  | "lastRedistribute";

type PlannerListener = (kind: PlannerChangeKind) => void;
const _plannerListeners = new Set<PlannerListener>();

export function onPlannerChanged(fn: PlannerListener): () => void {
  _plannerListeners.add(fn);
  return () => { _plannerListeners.delete(fn); };
}

function _notify(kind: PlannerChangeKind): void {
  for (const fn of _plannerListeners) {
    try { fn(kind); } catch { /* swallow */ }
  }
}

// ─── Accessors (sync) ────────────────────────────────────
export const plannerCache = {
  get: (): PlannerConfig => _plannerCache,
  set: (next: PlannerConfig): void => { _plannerCache = next; _notify("config"); },
};

export const disciplineCache = {
  get: (): DisciplineEntry[] => _disciplineCache,
  set: (next: DisciplineEntry[]): void => { _disciplineCache = next; _notify("discipline"); },
};

export const dailyMappedCache = {
  get: (): DailyMappedSlot => _dailyMapped,
  set: (next: DailyMappedSlot): void => { _dailyMapped = next; _notify("dailyMapped"); },
};

export const lastRedistributeCache = {
  get: (): string => _lastRedistributeDate,
  set: (next: string): void => { _lastRedistributeDate = next; _notify("lastRedistribute"); },
};

// ─── Boot ────────────────────────────────────────────────
/**
 * Initialize planner caches from IndexedDB.
 * Called once at boot after ensureDbOpen succeeds.
 */
export async function initPlannerCache(): Promise<void> {
  try {
    const [plannerRow, disciplineLog, dailyMappedRow, redistRow] = await Promise.all([
      db.settings.get("plannerConfig"),
      db.disciplineLog.toArray(),
      db.settings.get("dailyMapped"),
      db.settings.get("lastRedistribute"),
    ]);

    if (plannerRow?.value) {
      const parsed = plannerRow.value as Record<string, unknown>;
      // Migrate old decades → phases
      if ('decades' in parsed && !('phases' in parsed)) {
        const decades = (parsed as Record<string, unknown>).decades as StudyDecade[];
        const phases = decades.map((d: StudyDecade) => ({
          id: d.id,
          name: d.name,
          expectedDays: d.durationDays,
          categories: d.categories,
        }));
        const migrated = { ...parsed, phases } as Record<string, unknown>;
        delete migrated.decades;
        _plannerCache = { ...DEFAULT_CONFIG, ...(migrated as unknown as Partial<PlannerConfig>) };
      } else {
        _plannerCache = { ...DEFAULT_CONFIG, ...(parsed as Partial<PlannerConfig>) };
      }
    }

    _disciplineCache = disciplineLog;

    if (dailyMappedRow?.value) {
      _dailyMapped = dailyMappedRow.value as DailyMappedSlot;
    }
    if (redistRow?.value) {
      _lastRedistributeDate = redistRow.value as string;
    }
  } catch (err) {
    logger.warn("[planner] cache init failed, using defaults", err);
  }
}
