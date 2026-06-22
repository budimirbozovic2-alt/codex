/**
 * Boot heal steps — one-shot schema migrations (Faza 3).
 *
 * Formerly deferred via `taskScheduler.idle` after READY; now run during
 * `runMigrations` on SQLite open. Each step is idempotent and flagged in `kv`.
 */
import type { SqlExecutor } from "./executor";
import { healLegacyKvScalars } from "./kv";
import { loadAllCategoryRows } from "./category-codecs";
import {
  bindCardInsert,
  CARD_DECODE_SELECT,
  CARD_INSERT_SQL,
  decodeCard,
} from "./row-codecs";
import type { Card } from "@/lib/spaced-repetition";
import {
  LEGACY_FREQUENT_TAG,
  LEGACY_RARE_TAG,
  stripLegacyFrequencyTags,
} from "@/lib/sr/frequency";
import { healCardFsrsSections } from "@/lib/migrations/heal-fsrs-sections";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 200;

const FLAG_LEGACY_KV = "legacy-kv-scalars-healed-v1";
const FLAG_TAXONOMY = "card-taxonomy-heal-v1";
const FLAG_FREQUENCY = "legacy-frequency-tags-v1";
const FLAG_FSRS = "fsrs-last-reviewed-heal-v1";

async function hasFlag(exec: SqlExecutor, key: string): Promise<boolean> {
  const rows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ? LIMIT 1",
    [key],
  );
  return rows[0]?.value === "1";
}

async function setFlag(exec: SqlExecutor, key: string): Promise<void> {
  await exec.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
    key,
    "1",
  ]);
}

async function loadAllCards(exec: SqlExecutor): Promise<Card[]> {
  const rows = await exec.all<Record<string, unknown>>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards`,
  );
  const cards: Card[] = [];
  for (const row of rows) {
    try {
      cards.push(decodeCard(row));
    } catch {
      /* skip corrupt rows */
    }
  }
  return cards;
}

async function upsertCards(
  tx: SqlExecutor,
  cards: readonly Card[],
): Promise<void> {
  for (const card of cards) {
    await tx.run(CARD_INSERT_SQL, bindCardInsert(card));
  }
}

/** v11 — repair KV rows stored without JSON.stringify. */
export async function migrateLegacyKvScalars(
  exec: SqlExecutor,
): Promise<{ healed: number }> {
  if (await hasFlag(exec, FLAG_LEGACY_KV)) return { healed: 0 };
  const healed = await healLegacyKvScalars(exec);
  await setFlag(exec, FLAG_LEGACY_KV);
  if (healed > 0) {
    logger.info(`[migration] legacy KV scalars healed: ${healed}`);
  }
  return { healed };
}

/** v12 — reset stale subcategoryId / chapterId references. */
export async function migrateCardTaxonomyReferences(
  exec: SqlExecutor,
): Promise<{ patched: number }> {
  if (await hasFlag(exec, FLAG_TAXONOMY)) return { patched: 0 };

  const [cards, categories] = await Promise.all([
    loadAllCards(exec),
    loadAllCategoryRows(exec),
  ]);

  const subUuids = new Set<string>();
  const chapUuids = new Set<string>();
  const chapToSub = new Map<string, string>();

  for (const cat of categories) {
    for (const sub of cat.subcategories ?? []) {
      if (sub.id) subUuids.add(sub.id);
      for (const ch of sub.chapters ?? []) {
        if (typeof ch === "object" && ch.id) {
          chapUuids.add(ch.id);
          chapToSub.set(ch.id, sub.id);
        }
      }
    }
  }

  const patched: Card[] = [];
  for (const card of cards) {
    const patch: Partial<Card> = {};
    const subStale = !!card.subcategoryId && !subUuids.has(card.subcategoryId);
    const chapStale = !!card.chapterId && !chapUuids.has(card.chapterId);
    const chapMismatch =
      !subStale &&
      !!card.subcategoryId &&
      !!card.chapterId &&
      chapToSub.has(card.chapterId) &&
      chapToSub.get(card.chapterId) !== card.subcategoryId;

    if (subStale) {
      patch.subcategoryId = "";
      patch.chapterId = "";
    } else if (chapStale) {
      patch.chapterId = "";
    } else if (chapMismatch) {
      patch.chapterId = "";
    }

    if (Object.keys(patch).length > 0) {
      patched.push({ ...card, ...patch });
    }
  }

  if (patched.length > 0) {
    await exec.transaction(async (tx) => {
      for (let i = 0; i < patched.length; i += BATCH_SIZE) {
        await upsertCards(tx, patched.slice(i, i + BATCH_SIZE));
      }
      await setFlag(tx, FLAG_TAXONOMY);
    });
    logger.info(`[migration] card taxonomy heal: ${patched.length} card(s)`);
  } else {
    await setFlag(exec, FLAG_TAXONOMY);
  }

  return { patched: patched.length };
}

/** v13 — move legacy frequency tags from `tags[]` to `frequencyTag`. */
export async function migrateLegacyFrequencyTags(
  exec: SqlExecutor,
): Promise<{ migrated: number }> {
  if (await hasFlag(exec, FLAG_FREQUENCY)) return { migrated: 0 };

  const cards = await loadAllCards(exec);
  const migrated: Card[] = [];

  for (const card of cards) {
    const tags = card.tags;
    if (!tags || tags.length === 0) continue;
    const hadFreq = tags.includes(LEGACY_FREQUENT_TAG);
    const hadRare = tags.includes(LEGACY_RARE_TAG);
    if (!hadFreq && !hadRare) continue;
    migrated.push({
      ...card,
      tags: stripLegacyFrequencyTags(tags),
      frequencyTag: card.frequencyTag ?? (hadFreq ? "često" : "rijetko"),
    });
  }

  if (migrated.length > 0) {
    await exec.transaction(async (tx) => {
      for (let i = 0; i < migrated.length; i += BATCH_SIZE) {
        await upsertCards(tx, migrated.slice(i, i + BATCH_SIZE));
      }
      await setFlag(tx, FLAG_FREQUENCY);
    });
    logger.info(`[migration] frequency tags: ${migrated.length} card(s)`);
  } else {
    await setFlag(exec, FLAG_FREQUENCY);
  }

  return { migrated: migrated.length };
}

/** v14 — backfill missing `lastReviewed` on FSRS sections. */
export async function migrateFsrsLastReviewed(
  exec: SqlExecutor,
): Promise<{ migrated: number }> {
  if (await hasFlag(exec, FLAG_FSRS)) return { migrated: 0 };

  const cards = await loadAllCards(exec);
  const migrated: Card[] = [];

  for (const card of cards) {
    const healed = healCardFsrsSections(card);
    if (healed !== card) migrated.push(healed);
  }

  if (migrated.length > 0) {
    await exec.transaction(async (tx) => {
      for (let i = 0; i < migrated.length; i += BATCH_SIZE) {
        await upsertCards(tx, migrated.slice(i, i + BATCH_SIZE));
      }
      await setFlag(tx, FLAG_FSRS);
    });
    logger.info(`[migration] FSRS lastReviewed: ${migrated.length} card(s)`);
  } else {
    await setFlag(exec, FLAG_FSRS);
  }

  return { migrated: migrated.length };
}
