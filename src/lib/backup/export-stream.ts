/**
 * Streaming backup serializer — PR-9 A1c-3 nastavak.
 *
 * Post Dexie cut-over: rows come from SQLite-primary repos (via the
 * `@/lib/db/queries` barrel) instead of `Dexie.Table.each`. The wire
 * shape of the emitted JSON is unchanged so backup files remain
 * forward/backward-compatible.
 *
 * Per source we accept either:
 *   - a one-shot `rows()` reader returning the full row array (today's
 *     SQLite repos — `listAll*`), or
 *   - an `rowsAsync()` async iterable yielding rows/chunks (reserved for
 *     a future SQL cursor pass when payloads grow past ~50 MB and the
 *     "whole table in RAM" compromise stops being acceptable).
 *
 * Output batching, worker-side `JSON.stringify`, and `yieldUI()` between
 * chunks are preserved — peak heap is still bounded by `WORKER_BATCH` ×
 * row size during the serialisation phase, even though the read phase
 * materialises the whole table in one shot.
 *
 * Snapshot consistency note: SQLite WAL gives per-statement snapshot
 * isolation, not cross-statement. If the user is actively editing during
 * an export, individual table reads are consistent but the union across
 * tables may straddle a write. Acceptable for backup workflows; if cross-
 * table consistency becomes a requirement we'll wrap the whole read pass
 * in a single `SqlExecutor.transaction(..., "DEFERRED")` block.
 */

import { yieldUI } from "@/lib/backup/yield-ui";
import { serializeRowsInWorker } from "@/lib/backup/json-serialize-client";
import { backupLog } from "@/lib/backup/backup-logger";

export type ProgressFn = (pct: number, message: string) => void;

/**
 * Single table/source emission descriptor.
 *
 * `rows`: async one-shot loader (preferred path — matches today's SQLite
 *   `listAll*` repos). Result is JSON-serialised in worker batches.
 * `rowsAsync`: optional async iterable yielding either single rows or
 *   pre-chunked batches. Wins over `rows` when present.
 */
export interface ExportSourceSpec {
  /** JSON key in the resulting backup object. */
  key: string;
  /** One-shot reader: returns the full row array. */
  rows?: () => Promise<readonly unknown[]>;
  /**
   * Cursor-style reader. Each yielded value can be either a single row
   * (`unknown`) or a pre-batched array (`unknown[]`). Pre-batched arrays
   * are emitted as-is without further chunking.
   */
  rowsAsync?: () => AsyncIterable<unknown | readonly unknown[]>;
}

/** Convenience helper for the common one-shot path. */
export function sourceSpec(
  key: string,
  rows: () => Promise<readonly unknown[]>,
): ExportSourceSpec {
  return { key, rows };
}

// Rows per worker batch. Tuned for two competing concerns:
// - Larger batches amortize postMessage overhead and let the worker keep
//   the main thread idle for longer between handoffs.
// - Smaller batches keep the structured-clone payload bounded so we never
//   spike the heap when a single row (e.g. a Source with a fat HTML blob)
//   is large.
const WORKER_BATCH = 500;

async function emitArray(
  parts: BlobPart[],
  spec: ExportSourceSpec,
  onProgress: ProgressFn,
  pStart: number,
  pEnd: number,
): Promise<number> {
  parts.push(`"${spec.key}":[`);

  let i = 0;
  let isFirstBatch = true;

  const flushBatch = async (batch: readonly unknown[], total: number) => {
    if (batch.length === 0) return;
    const chunk = await serializeRowsInWorker(batch);
    parts.push(isFirstBatch ? chunk : "," + chunk);
    isFirstBatch = false;
    i += batch.length;
    const pct = total > 0
      ? pStart + Math.round(((pEnd - pStart) * Math.min(i, total)) / Math.max(total, 1))
      : pEnd;
    onProgress(pct, `${spec.key} ${i}/${total || i}`);
    await yieldUI();
  };

  // ── Cursor path (preferred when available) ─────────────────────────
  if (spec.rowsAsync) {
    let buffer: unknown[] = [];
    for await (const item of spec.rowsAsync()) {
      if (Array.isArray(item)) {
        // Pre-batched chunk from the producer — flush buffer first, then
        // emit the chunk wholesale.
        if (buffer.length > 0) { await flushBatch(buffer, 0); buffer = []; }
        await flushBatch(item, 0);
      } else {
        buffer.push(item);
        if (buffer.length >= WORKER_BATCH) {
          await flushBatch(buffer, 0);
          buffer = [];
        }
      }
    }
    if (buffer.length > 0) await flushBatch(buffer, 0);
    parts.push("]");
    onProgress(pEnd, `${spec.key} ${i}`);
    await yieldUI();
    return i;
  }

  // ── One-shot path ──────────────────────────────────────────────────
  if (!spec.rows) {
    parts.push("]");
    return 0;
  }
  const all = await spec.rows();
  const total = all.length;
  for (let start = 0; start < all.length; start += WORKER_BATCH) {
    await flushBatch(all.slice(start, start + WORKER_BATCH), total);
  }
  parts.push("]");
  onProgress(pEnd, `${spec.key} ${i}/${total}`);
  await yieldUI();
  return i;
}

export interface StreamBackupOptions {
  version: number;
  type: "full" | "template";
  /** Inline scalar/object fields written into the JSON object as-is */
  scalars: Record<string, unknown>;
  /** Tables/sources streamed as JSON arrays */
  sources: ExportSourceSpec[];
  onProgress: ProgressFn;
  /** Progress range reserved for streaming (pStart..pEnd) */
  pStart?: number;
  pEnd?: number;
}

export async function streamBackup(opts: StreamBackupOptions): Promise<Blob> {
  const { version, type, scalars, sources, onProgress } = opts;
  const pStart = opts.pStart ?? 10;
  const pEnd = opts.pEnd ?? 80;

  backupLog.start("export", "streamBackup begin", {
    version,
    type,
    sources: sources.map((t) => t.key),
  });

  onProgress(pStart, "Otvaranje read-snapshot…");

  const parts: BlobPart[] = [];
  parts.push(`{"version":${JSON.stringify(version)},"type":${JSON.stringify(type)}`);
  for (const [k, v] of Object.entries(scalars)) {
    parts.push(`,${JSON.stringify(k)}:${JSON.stringify(v)}`);
  }

  const span = pEnd - pStart;
  const stepPct = span / Math.max(sources.length, 1);

  try {
    for (let idx = 0; idx < sources.length; idx++) {
      const spec = sources[idx];
      parts.push(",");
      const a = pStart + Math.round(stepPct * idx);
      const b = pStart + Math.round(stepPct * (idx + 1));
      await emitArray(parts, spec, onProgress, a, b);
    }

    parts.push("}");
    onProgress(pEnd, "Finalizacija…");
    await yieldUI();
    const blob = new Blob(parts, { type: "application/json" });
    backupLog.success("export", "streamBackup complete", {
      bytes: blob.size,
      type,
    });
    return blob;
  } catch (err) {
    backupLog.error("export", "streamBackup failed", err);
    throw err;
  }
}
