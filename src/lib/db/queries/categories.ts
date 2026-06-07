/**
 * Categories repository — PR-9 A1c-4 F1.
 * SQLite-only read/write for categories.
 */
import type { 
  SqlExecutor 
} from "@/lib/persistence/sqlite/executor";
import type { CategoryRecord } from "@/lib/db-types";
import { logger } from "@/lib/logger";
import { 
  notifyExecutorNull 
} from "./_shared/executor-telemetry";
import {
  CATEGORY_INSERT_SQL,
  bindCategory,
} from "@/lib/backup/sqlite-row-bindings";

// ─── Executor accessor ──────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import(
      "@/lib/electron-integration"
    );
    if (!isElectron() && import.meta.env.PROD) {
      notifyExecutorNull("categories", "non-electron");
      return null;
    }
    const { getOpfsSqliteExecutor } = await import(
      "@/lib/persistence/sqlite/client"
    );

    // Faza 4: Mrtvi polling kod je uklonjen. 
    // Klijent samostalno i bezbjedno rješava čekanje.
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn(
      "[categories-repo] sqlite executor unavailable", 
      err
    );
    notifyExecutorNull("categories", "error");
    return null;
  }
}

async function requireExecutor(
  label: string
): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import(
    "@/lib/electron-integration"
  );
  assertDesktop();
  logger.warn(
    `[categories-repo] ${label} — no executor (dev shell)`
  );
  return null;
}

// ─── Codec ──────────────────────────────────────────────────────

function decode(row: { 
  payload: string 
}): CategoryRecord | null {
  try {
    return JSON.parse(row.payload) as CategoryRecord;
  } catch (err) {
    logger.warn("[categories-repo] decode failed", err);
    return null;
  }
}

// ─── Read API ───────────────────────────────────────────────────

/** All categories ordered by sortOrder, then name. */
export async function listAllCategories(): 
  Promise<CategoryRecord[]> {
  const exec = await requireExecutor("listAll");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM categories " +
    "ORDER BY sortOrder ASC, name ASC",
  );
  return rows
    .map(decode)
    .filter((c): c is CategoryRecord => c !== null);
}

export async function getCategory(
  id: string,
): Promise<CategoryRecord | null> {
  const exec = await requireExecutor("get");
  if (!exec) return null;
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM categories WHERE id = ? LIMIT 1",
    [id],
  );
  if (rows.length === 0) return null;
  return decode(rows[0]);
}

export async function countCategories(): Promise<number> {
  const exec = await requireExecutor("count");
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM categories",
  );
  return Number(rows[0]?.n ?? 0);
}

// ─── Write API ──────────────────────────────────────────────────

/**
 * Replace all categories atomically.
 */
export async function replaceAllCategories(
  records: readonly CategoryRecord[],
): Promise<void> {
  const exec = await requireExecutor("replaceAll");
  if (!exec) throw new Error("NO_EXECUTOR");
  await exec.transaction(async (tx) => {
    await tx.run("DELETE FROM categories");
    await tx.runMany(
      CATEGORY_INSERT_SQL, 
      records.map((c) => bindCategory(c))
    );
  });
}

/** Upsert a single category. */
export async function putCategory(
  c: CategoryRecord
): Promise<void> {
  const exec = await requireExecutor("put");
  if (!exec) throw new Error("NO_EXECUTOR");
  await exec.run(CATEGORY_INSERT_SQL, bindCategory(c));
}

/** Upsert N categories in one transaction. */
export async function bulkPutCategories(
  records: readonly CategoryRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const exec = await requireExecutor("bulkPut");
  if (!exec) throw new Error("NO_EXECUTOR");
  await exec.transaction(async (tx) => {
    await tx.runMany(
      CATEGORY_INSERT_SQL, 
      records.map((c) => bindCategory(c))
    );
  });
}

/** Wipe every category row. */
export async function clearCategories(): Promise<void> {
  const exec = await requireExecutor("clear");
  if (!exec) throw new Error("NO_EXECUTOR");
  await exec.run("DELETE FROM categories");
}