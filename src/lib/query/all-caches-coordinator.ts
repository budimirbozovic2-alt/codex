/**
 * Faza 2 — single authoritative SQLite → TanStack (+ satellite) commit path
 * for bulk operations (import, reset progress, taxonomy bulk, category delete).
 */
import type { CategoryRecord } from "@/lib/db-types";
import type { SRSettings } from "@/lib/spaced-repetition";
import { invalidateSourcesCache } from "@/domains/sources/sources-storage";
import { initPlannerCache } from "@/domains/planner/cache";
import { initMetacognitiveCache } from "@/domains/metacognition/metacognitive-storage";
import { notifyMnemonics } from "@/domains/mnemonic";
import { emitDomainChanged } from "@/lib/event-bus";
import { logger } from "@/lib/logger";
import {
  enterBulkWriteWork,
  exitBulkWriteWork,
} from "./bulk-write-session-depth";
import type { CategoryDeleteSatelliteOptions } from "./category-delete-satellites";
import {
  beginCardsWrite,
  commitCardsWriteFromDb,
  abortCardsWrite,
} from "./cards-cache-coordinator";
import {
  beginCategoriesWrite,
  commitCategoriesWriteFromRows,
  commitCategoriesWriteFromDb,
  abortCategoriesWrite,
} from "./categories-cache-coordinator";
import {
  beginReviewLogWrite,
  commitReviewLogFromDb,
  commitSrSettings,
  abortReviewLogWrite,
  REVIEW_LOG_BOOT_DAYS,
} from "./review-settings-cache-coordinator";

export interface AllCachesWriteSession {
  cardsGen: number | null;
  categoriesGen: number | null;
  reviewGen: number | null;
}

export interface BeginAllCachesWriteOptions {
  cards?: boolean;
  categories?: boolean;
  reviewLog?: boolean;
}

export type SatelliteSyncMode =
  | "import"
  | "reset-progress"
  | "category-delete"
  | "none";

export interface CommitAllCachesFromDbOptions {
  /** Import path — skip SQLite re-read when rows are already known. */
  freshCategories?: readonly CategoryRecord[];
  srSettings?: SRSettings | null;
  syncReviewLog?: boolean;
  reviewLogDays?: number;
  satellites?: SatelliteSyncMode;
  categoryDelete?: CategoryDeleteSatelliteOptions;
}

export type CommitOptsResolver<T> =
  | CommitAllCachesFromDbOptions
  | ((result: T) => CommitAllCachesFromDbOptions | undefined);

export class AllCachesCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllCachesCommitError";
  }
}

export function beginAllCachesWrite(
  options: BeginAllCachesWriteOptions = {},
): AllCachesWriteSession {
  const { cards = true, categories = true, reviewLog = false } = options;
  return {
    cardsGen: cards ? beginCardsWrite() : null,
    categoriesGen: categories ? beginCategoriesWrite() : null,
    reviewGen: reviewLog ? beginReviewLogWrite() : null,
  };
}

/** Non-core TanStack domains written during full backup import. */
export function syncImportSatelliteCaches(): void {
  invalidateSourcesCache();
  emitDomainChanged({ domain: "mindmaps" });
  emitDomainChanged({ domain: "mnemonics" });
  emitDomainChanged({ domain: "zettelkasten" });
  emitDomainChanged({ domain: "planner", kind: "config" });
  emitDomainChanged({ domain: "planner", kind: "discipline" });
}

async function syncResetProgressSatelliteCaches(): Promise<void> {
  await initPlannerCache().catch((err) => {
    logger.warn("[all-caches] planner cache reload failed", err);
  });
  await initMetacognitiveCache().catch((err) => {
    logger.warn("[all-caches] metacognitive cache reload failed", err);
  });
  notifyMnemonics();
}

function resolveCommitOpts<T>(
  commitOpts: CommitOptsResolver<T> | undefined,
  workResult: T,
): CommitAllCachesFromDbOptions {
  if (typeof commitOpts === "function") {
    return commitOpts(workResult) ?? {};
  }
  return commitOpts ?? {};
}

/**
 * Bulk SQLite writes with `skipNotify: true` in `work`, then one authoritative
 * TanStack seed via `commitAllCachesFromDb`. Aborts on failure.
 */
export async function runBulkWriteSession<T>(
  beginOpts: BeginAllCachesWriteOptions,
  work: () => Promise<T>,
  commitOpts?: CommitOptsResolver<T>,
): Promise<T> {
  const session = beginAllCachesWrite(beginOpts);
  enterBulkWriteWork();
  let result: T;
  try {
    result = await work();
  } catch (err) {
    exitBulkWriteWork();
    await abortAllCachesWrite(session);
    throw err;
  }
  exitBulkWriteWork();
  await commitAllCachesFromDb(
    session,
    resolveCommitOpts(commitOpts, result),
  );
  return result;
}

/** Card-only bulk session — categories/review caches untouched. */
export function runBulkCardsWrite<T>(
  work: () => Promise<T>,
  commitOpts?: CommitOptsResolver<T>,
): Promise<T> {
  return runBulkWriteSession({ cards: true, categories: false }, work, commitOpts);
}

export async function commitAllCachesFromDb(
  session: AllCachesWriteSession,
  options: CommitAllCachesFromDbOptions = {},
): Promise<{ cards: number; categories: number; reviewLog: number }> {
  const {
    freshCategories,
    srSettings = null,
    syncReviewLog = session.reviewGen !== null,
    reviewLogDays = REVIEW_LOG_BOOT_DAYS,
    satellites = "none",
  } = options;

  let cards = 0;
  let categories = 0;
  let reviewLog = 0;

  if (session.categoriesGen !== null) {
    if (freshCategories) {
      if (!commitCategoriesWriteFromRows(freshCategories, session.categoriesGen)) {
        throw new AllCachesCommitError("Sinhronizacija keša kategorija nije uspjela.");
      }
      categories = freshCategories.length;
    } else {
      const count = await commitCategoriesWriteFromDb(session.categoriesGen);
      if (count < 0) {
        throw new AllCachesCommitError("Sinhronizacija keša kategorija nije uspjela.");
      }
      categories = count;
    }
  }

  if (session.cardsGen !== null) {
    const count = await commitCardsWriteFromDb(session.cardsGen);
    if (count < 0) {
      throw new AllCachesCommitError("Sinhronizacija keša kartica nije uspjela.");
    }
    cards = count;
  }

  if (syncReviewLog) {
    const count = await commitReviewLogFromDb(
      reviewLogDays,
      session.reviewGen ?? undefined,
    );
    if (session.reviewGen !== null && count < 0) {
      throw new AllCachesCommitError("Sinhronizacija review loga nije uspjela.");
    }
    reviewLog = count;
  }

  if (srSettings) {
    await commitSrSettings(srSettings);
  }

  switch (satellites) {
    case "import":
      syncImportSatelliteCaches();
      break;
    case "reset-progress":
      await syncResetProgressSatelliteCaches();
      break;
    case "category-delete": {
      const del = options.categoryDelete;
      if (del) {
        const { syncCategoryDeleteSatelliteCaches } = await import(
          "./category-delete-satellites"
        );
        await syncCategoryDeleteSatelliteCaches(del);
      } else {
        logger.warn(
          "[all-caches] category-delete satellites skipped — missing categoryDelete opts",
        );
      }
      break;
    }
    case "none":
      break;
  }

  return { cards, categories, reviewLog };
}

export { syncCategoryDeleteSatelliteCaches } from "./category-delete-satellites";
export type { CategoryDeleteSatelliteOptions } from "./category-delete-satellites";

export async function abortAllCachesWrite(
  session: AllCachesWriteSession,
): Promise<void> {
  await Promise.all([
    session.cardsGen !== null ? abortCardsWrite() : Promise.resolve(0),
    session.categoriesGen !== null ? abortCategoriesWrite() : Promise.resolve(0),
    session.reviewGen !== null ? abortReviewLogWrite() : Promise.resolve(0),
  ]);
}
