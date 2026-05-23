import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler";

export async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      task,
      new Promise<T>((resolve) => {
        taskScheduler.setTimeout(() => resolve(fallback), timeoutMs, {
          label: `boot:withTimeout:${label}`,
          priority: "high",
        });
      }),
    ]);
  } catch (error) {
    logger.warn(`[boot] ${label} failed`, error);
    return fallback;
  }
}
