/**
 * Streaming backup serializer.
 *
 * Replaces the previous "load every table with `toArray()` then run a single
 * `JSON.stringify` over the whole payload" pattern with a per-table cursor
 * (`Table.each`) that writes each row directly into a `Blob` parts array.
 *
 * Properties:
 * - One row in JS heap at a time per table (cursor-driven), instead of every
 *   row of every table simultaneously. Peak RAM scales with the largest single
 *   row (e.g. one Source's `htmlContent`), not with the size of the database.
 * - The whole snapshot is produced inside a single Dexie read transaction so
 *   the resulting file is a consistent point-in-time view even if the user
 *   keeps editing during export.
 * - Cooperative `yieldUI()` between chunks keeps the main thread responsive
 *   and lets the real progress bar repaint.
 *
 * Yielding inside a Dexie transaction is safe: Dexie holds the IDB lock,
 * not the JS thread, and the transaction stays open until its last awaited
 * write resolves.
 */

import type Dexie from "dexie";
import type { Table } from "dexie";
import { db } from "@/lib/db";
import { yieldUI } from "@/lib/backup/yield-ui";
import { serializeRowsInWorker } from "@/lib/backup/json-serialize-client";
import { backupLog } from "@/lib/backup/backup-logger";

export type ProgressFn = (pct: number, message: string) => void;

interface StreamTableSpec {
  /** JSON key in the resulting backup object */
  key: string;
  /** Dexie table to stream. `null` skips emission (used for synthetic keys) */
  table: Table<unknown, unknown> | null;
  /** Optional ordered cursor (e.g. `categories.orderBy("sortOrder")`) */
  collection?: () => { each: (cb: (row: unknown) => unknown) => Promise<unknown> };
}

/**
 * Build a `StreamTableSpec` from a typed Dexie table. Concentrates the single
 * unavoidable Dexie variance cast (`Table<T,K>` is invariant in T/K) in one
 * generic helper instead of leaking `as unknown as Table<unknown,unknown>` to
 * every call site.
 */
export function tableSpec<T, K>(
  key: string,
  table: Table<T, K>,
  collection?: () => { each: (cb: (row: T) => unknown) => Promise<unknown> },
): StreamTableSpec {
  return {
    key,
    table: table as unknown as Table<unknown, unknown>,
    collection: collection as StreamTableSpec["collection"],
  };
}

/** Same idea as `tableSpec` but for the `txTables` scope array. */
export function txScope(...tables: Table<unknown, unknown>[] | Table<unknown>[]): Table<unknown, unknown>[] {
  return tables as Table<unknown, unknown>[];
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
  spec: StreamTableSpec,
  onProgress: ProgressFn,
  pStart: number,
  pEnd: number,
): Promise<number> {
  if (!spec.table && !spec.collection) {
    parts.push(`"${spec.key}":[]`);
    return 0;
  }
  const total = spec.table ? await spec.table.count() : 0;
  parts.push(`"${spec.key}":[`);

  // Buffer rows up to WORKER_BATCH, then off-thread `JSON.stringify` the
  // batch and push the result into `parts`. Dexie's `Collection.each`
  // awaits an async callback before advancing the IDB cursor, so this
  // bounded-buffer pattern keeps peak heap at one batch × row size while
  // still doing the heavy work off the main thread.
  let i = 0;
  let batch: unknown[] = [];
  let isFirstBatch = true;

  const flush = async () => {
    if (batch.length === 0) return;
    const chunk = await serializeRowsInWorker(batch);
    parts.push(isFirstBatch ? chunk : "," + chunk);
    isFirstBatch = false;
    batch = [];
    const pct = total > 0
      ? pStart + Math.round(((pEnd - pStart) * Math.min(i, total)) / Math.max(total, 1))
      : pEnd;
    onProgress(pct, `${spec.key} ${i}/${total || i}`);
    await yieldUI();
  };

  const cursor = spec.collection ? spec.collection() : spec.table!;
  await cursor.each(async (row: unknown) => {
    batch.push(row);
    i++;
    if (batch.length >= WORKER_BATCH) await flush();
  });
  await flush();

  parts.push("]");
  onProgress(pEnd, `${spec.key} ${i}/${total || i}`);
  await yieldUI();
  return i;
}

export interface StreamBackupOptions {
  version: number;
  type: "full" | "template";
  /** Inline scalar/object fields written into the JSON object as-is */
  scalars: Record<string, unknown>;
  /** Tables streamed as JSON arrays */
  tables: StreamTableSpec[];
  /** Read-tx scope */
  txTables: Table<unknown, unknown>[];
  onProgress: ProgressFn;
  /** Progress range reserved for streaming (pStart..pEnd) */
  pStart?: number;
  pEnd?: number;
}

export async function streamBackup(opts: StreamBackupOptions): Promise<Blob> {
  const { version, type, scalars, tables, txTables, onProgress } = opts;
  const pStart = opts.pStart ?? 10;
  const pEnd = opts.pEnd ?? 80;

  backupLog.start("export", "streamBackup begin", {
    version,
    type,
    tables: tables.map((t) => t.key),
  });

  onProgress(pStart, "Otvaranje read-snapshot transakcije…");

  const parts: BlobPart[] = [];
  parts.push(`{"version":${JSON.stringify(version)},"type":${JSON.stringify(type)}`);
  for (const [k, v] of Object.entries(scalars)) {
    parts.push(`,${JSON.stringify(k)}:${JSON.stringify(v)}`);
  }

  const span = pEnd - pStart;
  const stepPct = span / Math.max(tables.length, 1);

  try {
    await (db as unknown as Dexie).transaction("r", txTables, async () => {
      for (let idx = 0; idx < tables.length; idx++) {
        const spec = tables[idx];
        parts.push(",");
        const a = pStart + Math.round(stepPct * idx);
        const b = pStart + Math.round(stepPct * (idx + 1));
        await emitArray(parts, spec, onProgress, a, b);
      }
    });

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
