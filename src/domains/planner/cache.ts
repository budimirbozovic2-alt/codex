/**
 * Shared in-memory cache for planner storage (sync getters for UI).
 *
 * Writes no longer route through a JS-side mutex — PR-9 M3 cut-over puts
 * all persistence through the SQLite-primary repo (`@/lib/db/queries`),
 * which uses native SQLite transactions for serialization. Sub-modules
 * (`config`, `discipline`, `daily-mapped`) mutate the in-memory cache
 * synchronously and fire-and-forget the repo write.
 */
import type { PlannerConfig, StudyDecade, DisciplineEntry } from "./types";
import { DEFAULT_CONFIG, PLANNER_CONFIG_VERSION } from "./types";
import { loadPlannerSnapshot } from "@/lib/db/queries";
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
    try { fn(kind); } catch (e) { logger.warn("[planner-cache] listener threw", e); }
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
 * Initialize planner caches from persistent storage (SQLite-primary, Dexie
 * fallback). Called once at boot after ensureDbOpen succeeds.
 */
export async function initPlannerCache(): Promise<void> {
  try {
    const snap = await loadPlannerSnapshot();

    if (snap.plannerConfig) {
      const parsed = snap.plannerConfig as Record<string, unknown>;
      const version = typeof parsed.configVersion === "number" ? parsed.configVersion : 1;
      // v1 → v2: rename `decades` (legacy) → `phases`. Guarded by version so a
      // future shape that legitimately contains `decades` is not re-migrated.
      if (version < 2 && 'decades' in parsed && !('phases' in parsed)) {
        const decades = (parsed as Record<string, unknown>).decades as StudyDecade[];
        const phases = decades.map((d: StudyDecade) => ({
          id: d.id,
          name: d.name,
          expectedDays: d.durationDays,
          categories: d.categories,
        }));
        const migrated = { ...parsed, phases } as Record<string, unknown>;
        delete migrated.decades;
        migrated.configVersion = PLANNER_CONFIG_VERSION;
        _plannerCache = { ...DEFAULT_CONFIG, ...(migrated as unknown as Partial<PlannerConfig>) };
      } else {
        _plannerCache = { ...DEFAULT_CONFIG, ...(parsed as Partial<PlannerConfig>), configVersion: PLANNER_CONFIG_VERSION };
      }
    }

    _disciplineCache = snap.disciplineLog as DisciplineEntry[];

    if (snap.dailyMapped) {
      _dailyMapped = snap.dailyMapped as DailyMappedSlot;
    }
    if (snap.lastRedistribute) {
      _lastRedistributeDate = snap.lastRedistribute as string;
    }
  } catch (err) {
    logger.warn("[planner] cache init failed, using defaults", err);
  }
}
