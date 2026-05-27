/**
 * Planner repository — PR-9 M2.
 *
 * SQLite-primary read/write for planner state:
 *   • plannerConfig          (kv)
 *   • dailyMapped            (kv)
 *   • lastRedistribute       (kv)
 *   • disciplineLog          (table)
 *
 * Writes are mirrored to Dexie for one release as rollback insurance and
 * because legacy readers (electron backup, category-deletion-service) still
 * snapshot from Dexie. Mirroring is fire-and-forget — SQLite is the SSOT.
 *
 * In non-Electron environments (Vite dev preview) the SQLite executor is
 * unavailable; all functions transparently fall back to Dexie-only paths so
 * the dev experience is unchanged. Production is Electron-only.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { kvGet, kvPut } from "@/lib/persistence/sqlite/kv";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

/** Lazy executor accessor — null in non-Electron contexts. */
async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull("planner", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[planner-repo] sqlite executor unavailable, using Dexie fallback", err);
    notifyExecutorNull("planner", "error");
    return null;
  }
}

// ─── KV reads (used at cold start by initPlannerCache) ──────────────────

export interface PlannerHydrationSnapshot {
  plannerConfig: unknown | undefined;
  dailyMapped: unknown | undefined;
  lastRedistribute: unknown | undefined;
  disciplineLog: unknown[];
}

export async function loadPlannerSnapshot(): Promise<PlannerHydrationSnapshot> {
  const exec = await tryGetExecutor();
  if (exec) {
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

  // Dexie fallback (Vite dev preview).
  const [plannerRow, dailyMappedRow, redistRow, disciplineLog] = await Promise.all([
    db.settings.get("plannerConfig"),
    db.settings.get("dailyMapped"),
    db.settings.get("lastRedistribute"),
    db.disciplineLog.toArray(),
  ]);
  return {
    plannerConfig: plannerRow?.value,
    dailyMapped: dailyMappedRow?.value,
    lastRedistribute: redistRow?.value,
    disciplineLog,
  };
}

/**
 * Discipline-log dump for backup/health snapshots. SQLite-primary with a
 * Dexie fallback; keeps the date-ascending order the planner already uses
 * everywhere else.
 */
export async function listAllDisciplineLog(): Promise<unknown[]> {
  const exec = await tryGetExecutor();
  if (exec) {
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
    }
  }
  try { return await db.disciplineLog.toArray(); }
  catch (err) {
    logger.warn("[planner-repo] dexie listAllDisciplineLog failed", err);
    return [];
  }
}

export async function countDisciplineLog(): Promise<number> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ n: number }>(
        "SELECT COUNT(*) AS n FROM disciplineLog",
      );
      return Number(rows[0]?.n ?? 0);
    } catch (err) {
      logger.warn("[planner-repo] sqlite countDisciplineLog failed", err);
    }
  }
  try { return await db.disciplineLog.count(); }
  catch { return 0; }
}

// ─── KV writes ──────────────────────────────────────────────────────────

async function putKv(key: string, value: unknown): Promise<void> {
  const exec = await tryGetExecutor();
  if (!exec) {
    const { assertDesktop } = await import("@/lib/electron-integration");
    assertDesktop();
    return;
  }
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
  const exec = await tryGetExecutor();
  if (!exec) {
    const { assertDesktop } = await import("@/lib/electron-integration");
    assertDesktop();
    return;
  }
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
