/**
 * editor-v4 lazy migration — runtime entry point.
 *
 * Called once from `<AppBootstrap />` after the initial card/source/article
 * load. Walks each domain in idle batches, runs the pure dispatcher from
 * `migrate.ts`, and persists the resulting `contentDoc` through the existing
 * repository write paths:
 *
 *   • cards    → `cardRepository.bulkPut` (rides the outbox / persist-queue)
 *   • sources  → `saveSource` (debounced via repository)
 *   • articles → `saveArticle`
 *
 * Idempotent: records whose `contentDoc.version === 4` are skipped. Re-running
 * after a clean boot performs zero writes. Failures are warned and skipped —
 * a single broken HTML payload must NOT poison the rest of the batch.
 */
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler";
import * as cardMapWrites from "@/lib/cards/cardMapWrites";
import { saveSource } from "@/lib/sources-storage";
import { saveArticle } from "@/lib/zettelkasten-storage";
import {
  listAllSources,
} from "@/lib/db/queries";
import {
  listAllArticles,
  putArticle as putKnowledgeBaseArticle,
} from "@/lib/db/queries/knowledge-base";
import { migrateCard, migrateSource, migrateArticle } from "./migrate";
import type { Card } from "@/lib/spaced-repetition";
import type { Source, KnowledgeBaseArticle } from "@/lib/db-schema";

const BATCH = 25;

let _kicked = false;

/**
 * Schedule lazy migration over all three domains. Safe to call multiple times
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
}

async function migrateAllCards(): Promise<void> {
  try {
    const snapshot = cardMapWrites.snapshot();
    const cards = Object.values(snapshot) as Card[];
    const pending: Card[] = [];
    for (const c of cards) {
      const res = migrateCard(c);
      if (res.changed) pending.push(res.record);
    }
    if (pending.length === 0) return;
    for (let i = 0; i < pending.length; i += BATCH) {
      cardMapWrites.bulkPut(pending.slice(i, i + BATCH));
    }
    logger.log(`[editor-v4] migrated ${pending.length}/${cards.length} cards`);
  } catch (err) {
    logger.warn("[editor-v4] migrateAllCards failed", err);
  }
}

async function migrateAllSources(): Promise<void> {
  try {
    const sources = (await db.sources.toArray()) as Source[];
    let n = 0;
    for (const s of sources) {
      const res = migrateSource(s);
      if (!res.changed) continue;
      try {
        await saveSource(res.record);
        n++;
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
    const articles = (await db.knowledgeBaseArticles.toArray()) as KnowledgeBaseArticle[];
    let n = 0;
    for (const a of articles) {
      const res = migrateArticle(a);
      if (!res.changed) continue;
      try {
        // `saveArticle` rewrites `updatedAt` — undesirable for a silent backfill.
        // Bypass it with a direct put to preserve the original timestamp.
        await db.knowledgeBaseArticles.put(res.record);
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

// Re-export `saveArticle` reference to keep the import non-tree-shaken even
// though `migrateAllArticles` uses direct `db.put`. Future PRs that flip to
// going through the storage layer (with `updatedAt` rewrite intentional) can
// swap the implementation without changing call sites.
void saveArticle;
