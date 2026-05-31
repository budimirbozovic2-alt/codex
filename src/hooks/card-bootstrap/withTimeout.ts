import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler";

/**
 * Race a task against a timeout fallback.
 *
 * Audit v2 / Wave B.1: previously the outer `catch` returned `fallback`
 * on **any** rejection — including a real throw from the task itself.
 * That silently hid schema-migration failures: `runSchema.ts`'s outer
 * `try/catch` that wraps in `SchemaError` never fired because `withTimeout`
 * already swallowed the rejection. Now only the timeout branch resolves
 * with `fallback`; task rejections propagate untouched.
 *
 * The timeout is registered via `taskScheduler.setTimeout` and cancelled
 * the moment the task settles so the slot is released immediately
 * (previously the timer stayed armed even after the task resolved first,
 * accumulating ~7 dead high-priority slots per boot).
 */
export async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string, fallback: T): Promise<T> {
  let handle: ReturnType<typeof taskScheduler.setTimeout> | null = null;
  let timedOut = false;
  const timeoutPromise = new Promise<T>((resolve) => {
    handle = taskScheduler.setTimeout(() => {
      timedOut = true;
      resolve(fallback);
    }, timeoutMs, {
      label: `boot:withTimeout:${label}`,
      priority: "high",
    });
  });
  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (handle !== null) {
      try { taskScheduler.clearTimeout(handle); } catch { /* no-op */ }
    }
    if (timedOut) {
      logger.warn(`[boot] ${label} timed out after ${timeoutMs}ms — using fallback`);
    }
  }
}

