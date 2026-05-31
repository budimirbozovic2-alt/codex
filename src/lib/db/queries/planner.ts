/**
 * Planner repository — PR-9 A1c-2. SQLite-only.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { kvGet, kvPut } from "@/lib/persistence/sqlite/kv";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron() && import.meta.env.PROD) { notifyExecutorNull("planner", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[planner-repo] sqlite executor unavailable", err);
    notifyExecutorNull("planner", "error");
    return null;
  }
}

async function requireExecutor(label: string): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import("@/lib/electron-integration");
  assertDesktop();
  logger.warn(`[planner-repo] ${label} — no executor (dev shell)`);
  return null;
}

// ─── KV reads ───────────────────────────────────────────────────────────

export interface PlannerHydrationSnapshot {
  plannerConfig: unknown | undefined;
  dailyMapped: unknown | undefined;
  lastRedistribute: unknown | undefined;
  disciplineLog: unknown[];
}

export async function loadPlannerSnapshot(): Promise<PlannerHydrationSnapshot> {
  const exec = await requireExecutor("loadPlannerSnapshot");
  if (!exec) {
    return { plannerConfig: undefined, dailyMapped: undefined, lastRedistribute: undefined, disciplineLog: [] };
  }
  const [plannerConfig, dailyMapped, lastRedistribute, disciplineRows] = await Promise.all([
    kvGet<unknown>(exec, "plannerConfig"),
    kvGet<unknown>(exec, "dailyMapped"),
    kvGet<string>(exec, "lastRedistribute"),
    exec.all<{ payload: string }>("SELECT payload FROM disciplineLog ORDER BY date ASC"),
  ]);
  const disciplineLog = disciplineRows
    .map((r) => {
      try { return JSON.parse(r.payload) as unknown; } catch { return null; }
    })
    .filter((x): x is unknown => x !== null);
  return { plannerConfig, dailyMapped, lastRedistribute, disciplineLog };
}

export async function listAllDisciplineLog(): Promise<unknown[]> {
  const exec = await requireExecutor("listAllDisciplineLog");
  if (!exec) return [];
  try {
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM disciplineLog ORDER BY date ASC",
    );
    return rows
      .map((r) => {
        try { return JSON.parse(r.payload) as unknown; } catch { return null; }
      })
      .filter((x): x is unknown => x !== null);
  } catch (err) {
    logger.warn("[planner-repo] sqlite listAllDisciplineLog failed", err);
    return [];
  }
}

export async function countDisciplineLog(): Promise<number> {
  const exec = await requireExecutor("countDisciplineLog");
  if (!exec) return 0;
  try {
    const rows = await exec.all<{ n: number }>("SELECT COUNT(*) AS n FROM disciplineLog");
    return Number(rows[0]?.n ?? 0);
  } catch (err) {
    logger.warn("[planner-repo] sqlite countDisciplineLog failed", err);
    return 0;
  }
}

// ─── KV writes ──────────────────────────────────────────────────────────

async function putKv(key: string, value: unknown): Promise<void> {
  const exec = await requireExecutor("putKv");
  if (!exec) return;
  try {
    await kvPut(exec, key, value);
  } catch (err) {
    logger.warn(`[planner-repo] sqlite kvPut(${key}) failed`, err);
  }
}

export function savePlannerConfig(value: unknown): Promise<void> {
  return putKv("plannerConfig", value);
}

export function saveDailyMapped(value: unknown): Promise<void> {
  return putKv("dailyMapped", value);
}

export function saveLastRedistribute(value: string): Promise<void> {
  return putKv("lastRedistribute", value);
}

// ─── disciplineLog writes ───────────────────────────────────────────────

export async function saveDisciplineLog<T extends { date: string }>(
  entries: ReadonlyArray<T>,
): Promise<void> {
  const exec = await requireExecutor("saveDisciplineLog");
  if (!exec) return;
  try {
    await exec.transaction(async (tx) => {
      await tx.run("DELETE FROM disciplineLog");
      for (const e of entries) {
        await tx.run(
          "INSERT OR REPLACE INTO disciplineLog (date, payload) VALUES (?, ?)",
          [e.date, JSON.stringify(e)],
        );
      }
    });
  } catch (err) {
    logger.warn("[planner-repo] sqlite saveDisciplineLog failed", err);
  }
}
