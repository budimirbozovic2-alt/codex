/**
 * Fresh-install schema path (TD-ARCH-7).
 * Applies the final schema in one shot — no incremental migrations, no data heals.
 */
import type { SqlExecutor } from "./executor";
import schemaSql from "./schema.sql?raw";
import cleanSchemaAddon from "./clean-schema-addon.sql?raw";
import { logger } from "@/lib/logger";

export async function applyFreshSchema(
  exec: SqlExecutor,
  targetVersion: number,
): Promise<void> {
  await exec.exec("PRAGMA foreign_keys = ON;");
  await exec.exec("PRAGMA journal_mode = WAL;");
  await exec.exec(schemaSql);
  await exec.exec(cleanSchemaAddon);
  await exec.exec(`PRAGMA user_version = ${targetVersion}`);
  logger.info("[migration] fresh install — clean schema applied", {
    targetVersion,
  });
}
