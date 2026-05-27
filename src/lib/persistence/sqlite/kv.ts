/**
 * KV helpers — PR-9 M1.
 *
 * Thin typed wrapper around the `kv` table (TEXT key, TEXT JSON value).
 * Used by planner config / dailyMapped / lastRedistribute today, and ready
 * to absorb appSettings / subjectSettings / srSettings / appEntry once
 * those modules cut over.
 *
 * Zero-`any`. JSON.parse failures surface as `KvDecodeError` with the key
 * baked in — corrupt rows fail loudly instead of silently returning broken
 * config.
 */
import type { SqlExecutor } from "./executor";

export class KvDecodeError extends Error {
  constructor(public readonly key: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`[sqlite:kv] decode failed for key=${key}: ${msg}`);
    this.name = "KvDecodeError";
  }
}

export async function kvGet<T>(exec: SqlExecutor, key: string): Promise<T | undefined> {
  const rows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    [key],
  );
  if (rows.length === 0) return undefined;
  const raw = rows[0].value;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new KvDecodeError(key, err);
  }
}

export async function kvPut<T>(exec: SqlExecutor, key: string, value: T): Promise<void> {
  await exec.run(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    [key, JSON.stringify(value)],
  );
}

export async function kvDelete(exec: SqlExecutor, key: string): Promise<void> {
  await exec.run("DELETE FROM kv WHERE key = ?", [key]);
}

/** Bulk read for migration / hydration paths (planner cold start). */
export async function kvGetMany<T>(
  exec: SqlExecutor,
  keys: readonly string[],
): Promise<Map<string, T>> {
  if (keys.length === 0) return new Map();
  const placeholders = keys.map(() => "?").join(",");
  const rows = await exec.all<{ key: string; value: string }>(
    `SELECT key, value FROM kv WHERE key IN (${placeholders})`,
    keys as readonly string[],
  );
  const out = new Map<string, T>();
  for (const row of rows) {
    try {
      out.set(row.key, JSON.parse(row.value) as T);
    } catch (err) {
      throw new KvDecodeError(row.key, err);
    }
  }
  return out;
}
