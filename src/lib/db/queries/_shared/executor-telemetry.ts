// ─────────────────────────────────────────────────────────────────────────────
// Executor telemetry.
//
// Module-level map (not a Zustand store): pure boot-time instrumentation,
// must not pull React or any heavy dep, must work inside async-imported
// repo modules, and must be inspectable from DevTools without a hook.
// ─────────────────────────────────────────────────────────────────────────────
import { logger } from "@/lib/logger";

export type ExecutorMissReason = "non-electron" | "error" | "unknown";

type Counts = Record<string, number>;

const counts: Counts = Object.create(null);
const listeners = new Set<(domain: string, reason: ExecutorMissReason) => void>();

function key(domain: string, reason: ExecutorMissReason): string {
  return `${domain}.${reason}`;
}

export function notifyExecutorNull(
  domain: string,
  reason: ExecutorMissReason = "unknown",
): void {
  const k = key(domain, reason);
  counts[k] = (counts[k] ?? 0) + 1;
  // Loud in DEV so soak-week regressions surface immediately.
  if (import.meta.env?.DEV) {
    logger.warn(
      `[executor-telemetry] miss domain=${domain} reason=${reason} count=${counts[k]}`,
    );
  }
  for (const fn of listeners) {
    try { fn(domain, reason); }
    catch (err) { logger.warn("[executor-telemetry] listener threw", err); }
  }
}

export function getExecutorMissCounts(): Readonly<Counts> {
  return { ...counts };
}

export function getTotalExecutorMisses(): number {
  let total = 0;
  for (const k in counts) total += counts[k];
  return total;
}

export function onExecutorMiss(
  fn: (domain: string, reason: ExecutorMissReason) => void,
): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Test-only — never call from app code. */
export function __resetExecutorTelemetry(): void {
  for (const k in counts) delete counts[k];
  listeners.clear();
}

// DevTools handle. Read-only snapshot, safe to expose.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "__codex_executorMiss", {
    configurable: true,
    get: () => ({
      total: getTotalExecutorMisses(),
      byKey: getExecutorMissCounts(),
    }),
  });
}
