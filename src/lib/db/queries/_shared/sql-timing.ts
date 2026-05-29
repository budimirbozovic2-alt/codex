// ─────────────────────────────────────────────────────────────────────────────
// SQL timing telemetry — Phase A of the "Mammoth" sync-SQL mini-audit.
//
// Wraps hot read paths in `performance.mark` / `performance.measure` and
// keeps a module-level histogram per label (count, sum, max, p50, p95).
//
// Pattern mirrors `executor-telemetry`: no React, no heavy deps, inspectable
// from DevTools via `window.__codex_sqlTimings`.
//
// Threshold: durations > 16ms warn in DEV (one frame budget). Production
// stays silent — telemetry is for measurement, not user-facing errors.
// ─────────────────────────────────────────────────────────────────────────────
import { logger } from "@/lib/logger";

interface Histogram {
  count: number;
  sum: number;
  max: number;
  /** Bounded ring buffer for percentile estimation. Cap at 256 samples / label. */
  samples: number[];
}

const FRAME_BUDGET_MS = 16;
const SAMPLE_CAP = 256;

const histograms = new Map<string, Histogram>();

function record(label: string, dur: number): void {
  let h = histograms.get(label);
  if (!h) {
    h = { count: 0, sum: 0, max: 0, samples: [] };
    histograms.set(label, h);
  }
  h.count++;
  h.sum += dur;
  if (dur > h.max) h.max = dur;
  if (h.samples.length < SAMPLE_CAP) {
    h.samples.push(dur);
  } else {
    // Reservoir-style replacement so we don't lose late spikes.
    h.samples[h.count % SAMPLE_CAP] = dur;
  }
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export interface SqlTimingSnapshot {
  label: string;
  count: number;
  avg: number;
  max: number;
  p50: number;
  p95: number;
}

export function getSqlTimings(): SqlTimingSnapshot[] {
  const out: SqlTimingSnapshot[] = [];
  for (const [label, h] of histograms) {
    const sorted = [...h.samples].sort((a, b) => a - b);
    out.push({
      label,
      count: h.count,
      avg: h.count === 0 ? 0 : h.sum / h.count,
      max: h.max,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
    });
  }
  return out.sort((a, b) => b.p95 - a.p95);
}

/** Test-only — never call from app code. */
export function __resetSqlTimings(): void {
  histograms.clear();
}

/**
 * Wrap a SQL-bound async function and record duration under `label`. The
 * label should be stable and low-cardinality (use the repo function name).
 *
 * Emits `performance.mark` pairs so DevTools Performance panel can correlate
 * SQL work with React/render frames.
 */
export async function withSqlTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const hasPerf = typeof performance !== "undefined";
  const start = hasPerf ? performance.now() : 0;
  const startMark = `sql:${label}:start`;
  const endMark = `sql:${label}:end`;
  if (hasPerf && performance.mark) {
    try { performance.mark(startMark); } catch { /* no-op */ }
  }
  try {
    return await fn();
  } finally {
    if (hasPerf) {
      const dur = performance.now() - start;
      record(label, dur);
      if (performance.mark) {
        try {
          performance.mark(endMark);
          performance.measure?.(`sql:${label}`, startMark, endMark);
        } catch { /* no-op */ }
      }
      if (import.meta.env?.DEV && dur > FRAME_BUDGET_MS) {
        logger.warn(`[sql-timing] ${label} ${dur.toFixed(1)}ms > ${FRAME_BUDGET_MS}ms`);
      }
    }
  }
}

// DevTools handle — read-only snapshot.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "__codex_sqlTimings", {
    configurable: true,
    get: () => getSqlTimings(),
  });
}
