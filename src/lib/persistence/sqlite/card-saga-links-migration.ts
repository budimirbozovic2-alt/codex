/**
 * One-shot migration: add `parentId` and `isEndangered` columns to `cards`.
 * Idempotent — skips ALTER when columns already exist (e.g. fresh v1 schema).
 */
import type { SqlExecutor } from "./executor";

export async function migrateCardSagaLinks(
  exec: SqlExecutor,
): Promise<{ migrated: boolean }> {
  const cols = await exec.all<{ name: string }>("PRAGMA table_info(cards)");
  const names = new Set(cols.map((c) => c.name));

  if (!names.has("parentId")) {
    await exec.exec(
      "ALTER TABLE cards ADD COLUMN parentId TEXT REFERENCES cards(id) ON DELETE SET NULL;",
    );
  }
  if (!names.has("isEndangered")) {
    await exec.exec(
      "ALTER TABLE cards ADD COLUMN isEndangered INTEGER NOT NULL DEFAULT 0;",
    );
  }

  await exec.exec(
    "CREATE INDEX IF NOT EXISTS idx_cards_parentId ON cards(parentId);",
  );
  await exec.exec(
    "CREATE INDEX IF NOT EXISTS idx_cards_isEndangered ON cards(isEndangered);",
  );

  return { migrated: !names.has("parentId") || !names.has("isEndangered") };
}
