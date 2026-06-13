/**
 * editor-v4 lazy migration — runtime entry point.
 *
 * Called once from `<AppBootstrap />` after the initial card/source/article
 * load. Walks each domain in idle batches, runs the pure dispatcher from
 * `migrate.ts`, and persists the resulting `contentDoc` through the existing
 * write paths:
 *
 *   • cards    → `bulkPutCardsDirect` (SQLite transaction; TanStack invalidates via the cards-changed bridge)
 *   • sources  → `saveSource` (debounced via repository)
 *   • articles → `saveArticle`
 *   • mnemonics → `bulkPutMnemonics` (SQLite-primary repo)
 *
 * Idempotent: records whose `contentDoc.version === 4` are skipped. Re-running
 * after a clean boot performs zero writes. Failures are warned and skipped —
 * a single broken HTML payload must NOT poison the rest of the batch.
 */
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler";
import { bulkPutCardsDirect, snapshotAllCards } from "@/lib/db/queries";
import { saveSource } from "@/domains/sources/sources-storage";
import {
  listAllSources,
} from "@/lib/db/queries";
import {
  listAllArticles,
  putArticle as putKnowledgeBaseArticle,
} from "@/lib/db/queries/knowledge-base";
import {
  bulkPutMnemonics,
  listAllMnemonics,
} from "@/lib/db/queries/mnemonics";
import { migrateMnemonicCard } from "@/features/mnemonic/mnemonic-storage/mnemonic-section-codec";
import { migrateCard, migrateSource, migrateArticle } from "./migrate";
import type { Card } from "@/lib/spaced-repetition";
import type { Source, KnowledgeBaseArticle } from "@/lib/db-types";

const BATCH = 25;

let _kicked = false;

/**
 * Schedule lazy migration over all four domains. Safe to call multiple times
 * — the first call wins; subsequent calls no-op until the page reloads.
 */
export function kickoffEditorV4Migration(): void {
  if (_kicked) return;
  _kicked = true;
  taskScheduler.idle(() => { void migrateAllCards(); }, {
    label: "editor-v4:migrate-cards", timeoutMs: 5000, fallbackMs: 2000,
  });
  taskScheduler.idle(() => { void migrateAllSources(); }, {
    label: "editor-v4:migrate-sources", timeoutMs: 5000, fallbackMs: 3000,
  });
  taskScheduler.idle(() => { void migrateAllArticles(); }, {
    label: "editor-v4:migrate-articles", timeoutMs: 5000, fallbackMs: 4000,
  });
  taskScheduler.idle(() => { void migrateAllMnemonics(); }, {
    label: "editor-v4:migrate-mnemonics", timeoutMs: 5000, fallbackMs: 4500,
  });
}

async function migrateAllCards(): Promise<void> {
  try {
    const cards = await snapshotAllCards();
    const pending: Card[] = [];
    for (const c of cards) {
      const res = migrateCard(c);
      if (res.changed) pending.push(res.record);
    }
    if (pending.length === 0) return;
    for (let i = 0; i < pending.length; i += BATCH) {
      await bulkPutCardsDirect(pending.slice(i, i + BATCH));
    }
    logger.log(`[editor-v4] migrated ${pending.length}/${cards.length} cards`);
  } catch (err) {
    logger.warn("[editor-v4] migrateAllCards failed", err);
  }
}

async function migrateAllSources(): Promise<void> {
  try {
    const sources = (await listAllSources()) as Source[];
    let n = 0;
    for (const s of sources) {
      const res = migrateSource(s);
      if (!res.changed) continue;
      try {
        const wr = await saveSource(res.record);
        if (wr.ok === true) {
          n++;
        } else {
          logger.warn(`[editor-v4] saveSource(${s.id}) failed`, wr.error);
        }
      } catch (err) {
        logger.warn(`[editor-v4] saveSource(${s.id}) failed`, err);
      }
    }
    if (n > 0) logger.log(`[editor-v4] migrated ${n}/${sources.length} sources`);
  } catch (err) {
    logger.warn("[editor-v4] migrateAllSources failed", err);
  }
}

async function migrateAllArticles(): Promise<void> {
  try {
    const articles = (await listAllArticles()) as KnowledgeBaseArticle[];
    let n = 0;
    for (const a of articles) {
      const res = migrateArticle(a);
      if (!res.changed) continue;
      try {
        // `saveArticle` rewrites `updatedAt` — undesirable for a silent backfill.
        // Bypass it via the SQLite-primary repo writer (no Dexie mirror).
        await putKnowledgeBaseArticle(res.record);
        n++;
      } catch (err) {
        logger.warn(`[editor-v4] put article(${a.id}) failed`, err);
      }
    }
    if (n > 0) logger.log(`[editor-v4] migrated ${n}/${articles.length} articles`);
  } catch (err) {
    logger.warn("[editor-v4] migrateAllArticles failed", err);
  }
}

async function migrateAllMnemonics(): Promise<void> {
  try {
    const cards = await listAllMnemonics();
    const pending: typeof cards = [];
    for (const c of cards) {
      const res = migrateMnemonicCard(c);
      if (res.changed) pending.push(res.record);
    }
    if (pending.length === 0) return;
    for (let i = 0; i < pending.length; i += BATCH) {
      await bulkPutMnemonics(pending.slice(i, i + BATCH));
    }
    logger.log(`[editor-v4] migrated ${pending.length}/${cards.length} mnemonics`);
  } catch (err) {
    logger.warn("[editor-v4] migrateAllMnemonics failed", err);
  }
}

