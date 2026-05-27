/**
 * Migration runner — PR-8 M1.
 *
 * Reads `PRAGMA user_version`, applies any pending migrations in order, and
 * bumps the version inside the same transaction. Idempotent: re-running on
 * an up-to-date DB is a single PRAGMA read.
 *
 * Migration sources are embedded as string constants (not file reads) so the
 * Vite build can bundle them into the Electron asar without runtime file IO.
 */
import type { SqlExecutor } from "./executor";
import schemaSql from "./schema.sql?raw";

interface Migration {
  version: number;
  label: string;
  sql: string;
}

const MIGRATIONS: readonly Migration[] = [
  { version: 1, label: "init", sql: schemaSql },
  // PR-9 placeholder: add planner / examiner / drafts here once read-path
  // hydration moves off Dexie.
];

export const TARGET_USER_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function runMigrations(exec: SqlExecutor): Promise<{ from: number; to: number }> {
  await exec.exec("PRAGMA foreign_keys = ON;");
  // journal_mode is a connection-scoped pragma — repeat it on every open
  // (handled by the client) but harmless to set here too.
  await exec.exec("PRAGMA journal_mode = WAL;");

  const versionRows = await exec.all<{ user_version: number }>("PRAGMA user_version");
  const current = Number(versionRows[0]?.user_version ?? 0);
  if (current >= TARGET_USER_VERSION) return { from: current, to: current };

  await exec.transaction(async (tx) => {
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      await tx.exec(m.sql);
      // PRAGMA user_version can't be parameter-bound; safe because m.version
      // is an integer literal from the static MIGRATIONS table.
      await tx.exec(`PRAGMA user_version = ${m.version}`);
    }
  });

  return { from: current, to: TARGET_USER_VERSION };
}
