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

class KvDecodeError extends Error {
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
    // Legacy rows (pre-PR-9 import bug in bindKv) stored plain scalars without
    // JSON.stringify — e.g. lastRedistribute = 2026-06-16 instead of "2026-06-16".
    const trimmed = raw.trim();
    const looksLikeLegacyScalar = isLegacyKvScalar(raw);
    if (looksLikeLegacyScalar) {
      void kvPut(exec, key, trimmed).catch(() => { /* best-effort heal */ });
      return trimmed as T;
    }
    throw new KvDecodeError(key, err);
  }
}

export async function kvPut<T>(exec: SqlExecutor, key: string, value: T): Promise<void> {
  await exec.run(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    [key, JSON.stringify(value)],
  );
}

function isLegacyKvScalar(raw: string): boolean {
  const trimmed = raw.trim();
  return (
    trimmed.length > 0 &&
    trimmed[0] !== "{" &&
    trimmed[0] !== "[" &&
    trimmed[0] !== '"'
  );
}

/** One-time boot heal for KV rows written without JSON.stringify (import bug). */
export async function healLegacyKvScalars(exec: SqlExecutor): Promise<number> {
  const rows = await exec.all<{ key: string; value: string }>(
    "SELECT key, value FROM kv",
  );
  let healed = 0;
  for (const row of rows) {
    try {
      JSON.parse(row.value);
    } catch {
      if (!isLegacyKvScalar(row.value)) continue;
      await kvPut(exec, row.key, row.value.trim());
      healed++;
    }
  }
  return healed;
}

// `kvDelete` and `kvGetMany` removed in F6.3 — no consumers. The kv table
// is purged per-key via `deleteSetting` (settings repo) and read row-by-row
// via `kvGet`; bulk hydration paths build their own queries.

