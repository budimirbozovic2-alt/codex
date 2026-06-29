/**
 * Simulates an app session restart while keeping the E2E in-memory SQLite DB.
 * Tests the contract: SQLite retains rows, TanStack cache is empty until boot rehydrate.
 */
import {
  resetCardsQueryCache,
  resetCategoriesQueryCache,
  resetReviewSettingsQueryCache,
} from "@/lib/query/cache-coordinator";
import { __resetSqliteReadyForTests } from "@/lib/persistence/sqlite/readyMachine";
import { __resetBootStateForTests, runBootDag } from "@/lib/boot";

export async function simulateE2ESessionRestart(): Promise<void> {
  resetCardsQueryCache();
  resetCategoriesQueryCache();
  resetReviewSettingsQueryCache();
  __resetSqliteReadyForTests();
  __resetBootStateForTests();
  await runBootDag(new AbortController().signal);
}
