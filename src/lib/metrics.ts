/**
 * Lightweight production metrics surface.
 *
 * Goal: surface "hot path" health signals (cache invalidation churn,
 * dual-write success/failure, dropped events) WITHOUT spamming the console
 * in production builds where `logger.info/warn/debug` are no-ops.
 *
 * Design
 * ------
 * - In-process counters + last-event ring buffers, bounded to constant memory.
 * - Always executes (dev + prod). Cost is one Map lookup + integer increment.
 * - Exposed on `globalThis.__memoriaMetrics` for DevTools / Electron crash
 *   capture inspection. Never serialized to disk on its own.
 * - `logger.error` is still the channel for actual failures; metrics are
 *   strictly counters / observability — they never replace error logging.
 *
 * Usage
 * -----
 *   metrics.inc("bridges.cards.flush");
 *   metrics.inc("bridges.cards.invalidate", keys.length);
 *   metrics.observe("bridges.cards.batchSize", keys.length);
 *   metrics.event("mnemonic.dualWrite.fail", { reason });
 *
 * Snapshot (DevTools):
 *   window.__memoriaMetrics.snapshot()
 */

const EVENT_RING_CAP = 50;

interface MetricsState {
  counters: Map<string, number>;
  // Rolling summary: count + sum + min + max for cheap p50-ish estimation
  // via avg (sum/count). Full histogram is overkill for our needs.
  observations: Map<string, { count: number; sum: number; min: number; max: number }>;
  // Bounded ring of recent named events (with optional payload).
  events: Array<{ ts: number; name: string; data?: unknown }>;
}

const state: MetricsState = {
  counters: new Map(),
  observations: new Map(),
  events: [],
};

function inc(name: string, by: number = 1): void {
  state.counters.set(name, (state.counters.get(name) ?? 0) + by);
}

function observe(name: string, value: number): void {
  const cur = state.observations.get(name);
  if (cur === undefined) {
    state.observations.set(name, { count: 1, sum: value, min: value, max: value });
    return;
  }
  cur.count += 1;
  cur.sum += value;
  if (value < cur.min) cur.min = value;
  if (value > cur.max) cur.max = value;
}

function event(name: string, data?: unknown): void {
  state.events.push({ ts: Date.now(), name, data });
  if (state.events.length > EVENT_RING_CAP) state.events.shift();
  inc(`event.${name}`);
}

interface Snapshot {
  counters: Record<string, number>;
  observations: Record<string, { count: number; sum: number; avg: number; min: number; max: number }>;
  events: ReadonlyArray<{ ts: number; name: string; data?: unknown }>;
}

function snapshot(): Snapshot {
  const counters: Record<string, number> = {};
  for (const [k, v] of state.counters) counters[k] = v;
  const observations: Snapshot["observations"] = {};
  for (const [k, v] of state.observations) {
    observations[k] = { ...v, avg: v.count > 0 ? v.sum / v.count : 0 };
  }
  return { counters, observations, events: state.events.slice() };
}

function reset(): void {
  state.counters.clear();
  state.observations.clear();
  state.events.length = 0;
}

export const metrics = { inc, observe, event, snapshot, reset } as const;
type Metrics = typeof metrics;

// Expose for DevTools / Electron renderer crash capture.
// Guarded so SSR/test environments without globalThis side-effects are safe.
try {
  (globalThis as unknown as { __memoriaMetrics?: Metrics }).__memoriaMetrics = metrics;
} catch {
  /* ignore — sandboxed envs */
}
