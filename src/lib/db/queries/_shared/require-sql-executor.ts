import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { logger } from "@/lib/logger";

export async function requireSqlExecutor(label: string): Promise<SqlExecutor> {
  if (import.meta.env.VITEST) {
    const { getTestSqlExecutor } = await import("@/test/sqlite-harness");
    return getTestSqlExecutor();
  }

  const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
  try {
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.error(`[${label}] SQLite executor unavailable`, err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
