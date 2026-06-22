/**
 * Soft reset — clears learning/review progress while keeping content:
 * cards (text/structure), categories, sources, mind maps, wiki, mnemonics.
 */
import type { MnemonicCard } from "@/domains/mnemonic";
import {
  bulkPutMnemonics,
  clearLearnProgress,
  listAllCards,
  listAllMnemonics,
} from "@/lib/db/queries";
import { reviewLogRepository } from "@/lib/repositories/reviewLogRepository";
import {
  abortAllCachesWrite,
  beginAllCachesWrite,
  commitAllCachesFromDb,
} from "@/lib/query/all-caches-coordinator";
import { runInTransaction } from "@/lib/persistence/sqlite/client";
import { kvPut } from "@/lib/persistence/sqlite/kv";
import {
  CARD_INSERT_SQL,
  bindCardInsert,
} from "@/lib/persistence/sqlite/row-codecs";
import { syncCardSectionsIndexMany } from "@/lib/persistence/sqlite/card-sections-index";
import { clearSavedReviewSession } from "@/domains/review/review-session-storage";
import { logger } from "@/lib/logger";
import { resetCardLearningProgress } from "./reset-section-progress";

const PROGRESS_LOG_TABLES = [
  "reviewLog",
  "diary",
  "calibrationLog",
  "latencyLog",
  "slippageLog",
  "activityLog",
  "disciplineLog",
  "pomodoroLog",
  "mnemonicTestLog",
] as const;

export interface ResetLearningProgressReport {
  cardsReset: number;
  sectionsReset: number;
  mnemonicsReset: number;
}

function resetMnemonicProgress(m: MnemonicCard): MnemonicCard {
  return {
    ...m,
    testCount: 0,
    successCount: 0,
    failCount: 0,
    lastTested: null,
  };
}

/**
 * Atomically wipe learning progress. Content tables (cards payload text,
 * categories, sources, mindMaps, knowledgeBaseArticles, mnemonics body) stay.
 */
export async function resetLearningProgress(): Promise<ResetLearningProgressReport> {
  await reviewLogRepository.flush();
  await reviewLogRepository.clearAll();

  const now = Date.now();
  const cards = await listAllCards();
  const cardCountBefore = cards.length;
  const resetCards = cards.map((c) => resetCardLearningProgress(c, now));
  const sectionsReset = resetCards.reduce((n, c) => n + c.sections.length, 0);

  const mnemonics = await listAllMnemonics();
  const resetMnemonics = mnemonics.map(resetMnemonicProgress);

  const cardsWriteGen = beginAllCachesWrite({ categories: false });
  let cacheCommitted = false;

  // Cards first, then logs — same tx, but clearer intent: never leave DB without cards.
  try {
    await runInTransaction(async (tx) => {
      if (resetCards.length > 0) {
        await tx.runMany(CARD_INSERT_SQL, resetCards.map(bindCardInsert));
        await syncCardSectionsIndexMany(tx, resetCards);
      }
      for (const table of PROGRESS_LOG_TABLES) {
        await tx.run(`DELETE FROM ${table}`);
      }
    });

    const afterCards = await listAllCards();
    if (afterCards.length !== cardCountBefore) {
      throw new Error(
        `Reset nije sačuvan: očekivano ${cardCountBefore} kartica, u bazi ${afterCards.length}.`,
      );
    }

    if (resetMnemonics.length > 0) {
      await bulkPutMnemonics(resetMnemonics);
    }

    await runInTransaction(async (tx) => {
      await kvPut(tx, "dailyMapped", { date: "", count: 0 });
      await kvPut(tx, "lastRedistribute", "");
      await kvPut(tx, "lastAnalysisDate", null);
      await kvPut(tx, "appEntry", null);
      await kvPut(tx, "sr-review-session", null);
    });

    await clearLearnProgress();

    await commitAllCachesFromDb(cardsWriteGen, {
      syncReviewLog: true,
      satellites: "reset-progress",
    });
    cacheCommitted = true;
  } catch (err) {
    if (!cacheCommitted) {
      await abortAllCachesWrite(cardsWriteGen);
    }
    throw err;
  }

  await clearSavedReviewSession();

  logger.info("[reset-progress] learning progress reset", {
    cardsReset: resetCards.length,
    sectionsReset,
    mnemonicsReset: resetMnemonics.length,
  });

  return {
    cardsReset: resetCards.length,
    sectionsReset,
    mnemonicsReset: resetMnemonics.length,
  };
}
