/**
 * Simulates an app session restart while keeping the E2E in-memory SQLite DB.
 * Tests the contract: SQLite retains rows, TanStack cache is empty until boot rehydrate.
 */
import { resetCardsQueryCache } from "@/lib/query/cards-cache-coordinator";
import { resetCategoriesQueryCache } from "@/lib/query/categories-cache-coordinator";
import { resetReviewSettingsQueryCache } from "@/lib/query/review-settings-cache-coordinator";
import { __resetSqliteReadyForTests } from "@/lib/persistence/sqlite/readyMachine";
import { __resetBootStateForTests } from "@/lib/boot";
import { runBootDag } from "@/hooks/card-bootstrap/boot-dag";

export async function simulateE2ESessionRestart(): Promise<void> {
  resetCardsQueryCache();
  resetCategoriesQueryCache();
  resetReviewSettingsQueryCache();
  __resetSqliteReadyForTests();
  __resetBootStateForTests();
  await runBootDag(new AbortController().signal);
}
