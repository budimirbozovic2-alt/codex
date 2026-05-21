import { logger } from "@/lib/logger";
export async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string, fallback: T): Promise<T> {
  try {
    return await Promise.race([task, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]);
  } catch (error) {
    logger.warn(`[boot] ${label} failed`, error);
    return fallback;
  }
}
