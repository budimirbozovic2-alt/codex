/**
 * Legacy backfill for `card_sections_index` (v7 heal).
 * TD-ARCH-8: skipped when `card_sections` already exists — v17 path uses
 * `card-sections-migration.ts` instead.
 */
import type { SqlExecutor } from "./executor";
import { decodeCard } from "./row-codecs";

const LEGACY_INDEX_UPSERT = `
  INSERT INTO card_sections_index (card_id, section_id, state, next_review)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(card_id, section_id) DO UPDATE SET
    state = excluded.state,
    next_review = excluded.next_review
`;

const FLAG_KEY = "card-sections-index-v1";
const BATCH_SIZE = 200;

async function legacyIndexTableExists(exec: SqlExecutor): Promise<boolean> {
  const rows = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
    ["card_sections_index"],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function syncLegacyIndexMany(
  tx: SqlExecutor,
  cards: readonly import("@/lib/sr/types").Card[],
): Promise<void> {
  for (const card of cards) {
    await tx.run("DELETE FROM card_sections_index WHERE card_id = ?", [card.id]);
    for (const s of card.sections) {
      await tx.run(LEGACY_INDEX_UPSERT, [card.id, s.id, s.state, s.nextReview]);
    }
  }
}

export async function migrateCardSectionsIndex(
  exec: SqlExecutor,
): Promise<{ migrated: number }> {
  const sectionsTable = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
    ["card_sections"],
  );
  if (Number(sectionsTable[0]?.n ?? 0) > 0) {
    const { migrateCardSectionsNormalized } = await import(
      "./card-sections-migration"
    );
    return migrateCardSectionsNormalized(exec);
  }

  if (!(await legacyIndexTableExists(exec))) return { migrated: 0 };

  const flagRows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ? LIMIT 1",
    [FLAG_KEY],
  );
  if (flagRows[0]?.value === "1") return { migrated: 0 };

  const rows = await exec.all<{ payload: string }>("SELECT payload FROM cards");
  if (rows.length === 0) {
    await exec.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
    return { migrated: 0 };
  }

  let migrated = 0;
  await exec.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const cards = batch
        .map((row) => {
          try {
            return decodeCard(row);
          } catch {
            return null;
          }
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      if (cards.length > 0) {
        await syncLegacyIndexMany(tx, cards);
        migrated += cards.length;
      }
    }
    await tx.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
  });

  return { migrated };
}
