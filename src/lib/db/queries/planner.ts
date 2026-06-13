/**
 * Planner repository — PR-9 A1c-2. SQLite-only.
 */
import { kvGet, kvPut } from "@/lib/persistence/sqlite/kv";
import { logger } from "@/lib/logger";
import { requireSqlExecutor } from "./_shared/require-sql-executor";

// ─── KV reads ───────────────────────────────────────────────────

export interface PlannerHydrationSnapshot {
  plannerConfig: unknown | undefined;
  dailyMapped: unknown | undefined;
  lastRedistribute: unknown | undefined;
  disciplineLog: unknown[];
}

export async function loadPlannerSnapshot(): 
  Promise<PlannerHydrationSnapshot> {
  const exec = await requireSqlExecutor("planner:loadPlannerSnapshot");
  
  const [
    plannerConfig, 
    dailyMapped, 
    lastRedistribute, 
    disciplineRows
  ] = await Promise.all([
    kvGet<unknown>(exec, "plannerConfig"),
    kvGet<unknown>(exec, "dailyMapped"),
    kvGet<string>(exec, "lastRedistribute"),
    exec.all<{ payload: string }>(
      "SELECT payload FROM disciplineLog ORDER BY date ASC"
    ),
  ]);
  
  const disciplineLog = disciplineRows
    .map((r) => {
      try { 
        return JSON.parse(r.payload) as unknown; 
      } catch { 
        return null; 
      }
    })
    .filter((x): x is unknown => x !== null);
    
  return { 
    plannerConfig, 
    dailyMapped, 
    lastRedistribute, 
    disciplineLog 
  };
}

export async function listAllDisciplineLog(): Promise<unknown[]> {
  const exec = await requireSqlExecutor("planner:listAllDisciplineLog");
  try {
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM disciplineLog ORDER BY date ASC",
    );
    return rows
      .map((r) => {
        try { 
          return JSON.parse(r.payload) as unknown; 
        } catch { 
          return null; 
        }
      })
      .filter((x): x is unknown => x !== null);
  } catch (err) {
    logger.warn(
      "[planner-repo] sqlite listAllDisciplineLog failed", 
      err
    );
    return [];
  }
}

export async function countDisciplineLog(): Promise<number> {
  const exec = await requireSqlExecutor("planner:countDisciplineLog");
  try {
    const rows = await exec.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM disciplineLog"
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err) {
    logger.warn(
      "[planner-repo] sqlite countDisciplineLog failed", 
      err
    );
    return 0;
  }
}

// ─── KV writes ──────────────────────────────────────────────────

async function putKv(key: string, value: unknown): Promise<void> {
  const exec = await requireSqlExecutor("planner:putKv");
  try {
    await kvPut(exec, key, value);
  } catch (err) {
    logger.warn(
      `[planner-repo] sqlite kvPut(${key}) failed`, 
      err
    );
  }
}

export function savePlannerConfig(value: unknown): Promise<void> {
  return putKv("plannerConfig", value);
}

export function saveDailyMapped(value: unknown): Promise<void> {
  return putKv("dailyMapped", value);
}

export function saveLastRedistribute(
  value: string
): Promise<void> {
  return putKv("lastRedistribute", value);
}

// ─── disciplineLog writes ───────────────────────────────────────

export async function saveDisciplineLog<
  T extends { date: string }
>(
  entries: ReadonlyArray<T>,
): Promise<void> {
  const exec = await requireSqlExecutor("planner:saveDisciplineLog");
  try {
    await exec.transaction(async (tx) => {
      await tx.run("DELETE FROM disciplineLog");
      
      // OPTIMIZACIJA: runMany umjesto for-tx.run petlje
      if (entries.length > 0) {
        const batches = entries.map(e => [
          e.date, 
          JSON.stringify(e)
        ]);
        await tx.runMany(
          "INSERT OR REPLACE INTO disciplineLog (date, payload) " +
          "VALUES (?, ?)",
          batches
        );
      }
    });
  } catch (err) {
    logger.warn(
      "[planner-repo] sqlite saveDisciplineLog failed", 
      err
    );
    throw err instanceof Error ? err : new Error(String(err));
  }
}
