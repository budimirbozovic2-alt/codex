/**
 * Unified bulk write session — SQLite work + authoritative TanStack commit.
 * TD-ARCH-4: replaces all-caches-coordinator + bulk-write-session-depth.
 */
import type { CategoryRecord } from "@/lib/db-types";
import type { SRSettings } from "@/lib/spaced-repetition";
import { invalidateImportSatelliteQueries } from "@/lib/query/domain-invalidation";
import { logger } from "@/lib/logger";
import type { CategoryDeleteSatelliteOptions } from "./category-delete-satellites";
import {
  REVIEW_LOG_BOOT_DAYS,
  abortCardsWrite,
  abortCategoriesWrite,
  abortReviewLogWrite,
  beginCardsWrite,
  beginCategoriesWrite,
  beginReviewLogWrite,
  commitCardsWriteFromDb,
  commitCategoriesWriteFromDb,
  commitCategoriesWriteFromRows,
  commitReviewLogFromDb,
  commitSrSettings,
} from "./cache-coordinator";

// ── Bulk write depth (suppresses scoped card notify during work phase) ──

let _bulkWriteDepth = 0;

export function enterBulkWriteWork(): void {
  _bulkWriteDepth += 1;
}

export function exitBulkWriteWork(): void {
  _bulkWriteDepth = Math.max(0, _bulkWriteDepth - 1);
}

export function getBulkWriteDepth(): number {
  return _bulkWriteDepth;
}

export function resetBulkWriteDepthForTest(): void {
  _bulkWriteDepth = 0;
}

// ── Write session types ──────────────────────────────────────────────────

export interface WriteSession {
  cardsGen: number | null;
  categoriesGen: number | null;
  reviewGen: number | null;
}

export interface WriteScope {
  cards?: boolean;
  categories?: boolean;
  reviewLog?: boolean;
}

export type SatelliteSyncMode =
  | "import"
  | "reset-progress"
  | "category-delete"
  | "none";

export interface CommitWriteSessionOptions {
  freshCategories?: readonly CategoryRecord[];
  srSettings?: SRSettings | null;
  syncReviewLog?: boolean;
  reviewLogDays?: number;
  satellites?: SatelliteSyncMode;
  categoryDelete?: CategoryDeleteSatelliteOptions;
}

export type CommitOptsResolver<T> =
  | CommitWriteSessionOptions
  | ((result: T) => CommitWriteSessionOptions | undefined);

export class WriteSessionCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteSessionCommitError";
  }
}

export function beginWriteSession(
  options: WriteScope = {},
): WriteSession {
  const { cards = true, categories = true, reviewLog = false } = options;
  return {
    cardsGen: cards ? beginCardsWrite() : null,
    categoriesGen: categories ? beginCategoriesWrite() : null,
    reviewGen: reviewLog ? beginReviewLogWrite() : null,
  };
}

export function syncImportSatelliteCaches(): void {
  invalidateImportSatelliteQueries();
}

async function syncResetProgressSatelliteCaches(): Promise<void> {
  const { initPlannerCache } = await import("@/domains/planner/cache");
  const { initMetacognitiveCache } = await import(
    "@/domains/metacognition/metacognitive-storage"
  );
  const { notifyMnemonics } = await import("@/domains/mnemonic");
  await initPlannerCache().catch((err) => {
    logger.warn("[write-session] planner cache reload failed", err);
  });
  await initMetacognitiveCache().catch((err) => {
    logger.warn("[write-session] metacognitive cache reload failed", err);
  });
  notifyMnemonics();
}

function resolveCommitOpts<T>(
  commitOpts: CommitOptsResolver<T> | undefined,
  workResult: T,
): CommitWriteSessionOptions {
  if (typeof commitOpts === "function") {
    return commitOpts(workResult) ?? {};
  }
  return commitOpts ?? {};
}

/**
 * Bulk SQLite writes with `skipNotify: true` in `work`, then one authoritative
 * TanStack seed via `commitWriteSessionFromDb`.
 */
export async function runWriteSession<T>(
  scope: WriteScope,
  work: () => Promise<T>,
  commitOpts?: CommitOptsResolver<T>,
): Promise<T> {
  const session = beginWriteSession(scope);
  enterBulkWriteWork();
  let result: T;
  try {
    result = await work();
  } catch (err) {
    exitBulkWriteWork();
    await abortWriteSession(session);
    throw err;
  }
  exitBulkWriteWork();
  await commitWriteSessionFromDb(
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
  return runWriteSession({ cards: true, categories: false }, work, commitOpts);
}

export async function commitWriteSessionFromDb(
  session: WriteSession,
  options: CommitWriteSessionOptions = {},
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
        throw new WriteSessionCommitError("Sinhronizacija keša kategorija nije uspjela.");
      }
      categories = freshCategories.length;
    } else {
      const count = await commitCategoriesWriteFromDb(session.categoriesGen);
      if (count < 0) {
        throw new WriteSessionCommitError("Sinhronizacija keša kategorija nije uspjela.");
      }
      categories = count;
    }
  }

  if (session.cardsGen !== null) {
    const count = await commitCardsWriteFromDb(session.cardsGen);
    if (count < 0) {
      throw new WriteSessionCommitError("Sinhronizacija keša kartica nije uspjela.");
    }
    cards = count;
  }

  if (syncReviewLog) {
    const count = await commitReviewLogFromDb(
      reviewLogDays,
      session.reviewGen ?? undefined,
    );
    if (session.reviewGen !== null && count < 0) {
      throw new WriteSessionCommitError("Sinhronizacija review loga nije uspjela.");
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
          "[write-session] category-delete satellites skipped — missing categoryDelete opts",
        );
      }
      break;
    }
    case "none":
      break;
  }

  return { cards, categories, reviewLog };
}

export async function abortWriteSession(
  session: WriteSession,
): Promise<void> {
  await Promise.all([
    session.cardsGen !== null ? abortCardsWrite() : Promise.resolve(0),
    session.categoriesGen !== null ? abortCategoriesWrite() : Promise.resolve(0),
    session.reviewGen !== null ? abortReviewLogWrite() : Promise.resolve(0),
  ]);
}

export { syncCategoryDeleteSatelliteCaches } from "./category-delete-satellites";
export type { CategoryDeleteSatelliteOptions } from "./category-delete-satellites";
