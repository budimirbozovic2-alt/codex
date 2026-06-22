import { expect } from "vitest";
import { listAllCards, countAllCards, listAllCategories, countCategories } from "@/lib/db/queries";
import {
  getCardsHydrated,
  resetCardsQueryCache,
} from "@/lib/query/cards-cache-coordinator";
import {
  getCategoriesHydrated,
  resetCategoriesQueryCache,
} from "@/lib/query/categories-cache-coordinator";
import { resetReviewSettingsQueryCache } from "@/lib/query/review-settings-cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { __resetSqliteReadyForTests } from "@/lib/persistence/sqlite/readyMachine";
import { __resetBootStateForTests } from "@/lib/boot";

export function simulateAppSessionReset(options?: {
  resetBoot?: boolean;
}): void {
  resetCardsQueryCache();
  resetCategoriesQueryCache();
  resetReviewSettingsQueryCache();
  __resetSqliteReadyForTests();
  if (options?.resetBoot) {
    __resetBootStateForTests();
  }
}

export function expectCardsCacheEmpty(): void {
  expect(queryClient.getQueryData(queryKeys.cards.all())).toBeUndefined();
  expect(getCardsHydrated()).toBe(false);
}

export function expectCategoriesCacheEmpty(): void {
  expect(queryClient.getQueryData(queryKeys.categories.all())).toBeUndefined();
  expect(getCategoriesHydrated()).toBe(false);
}

export async function assertNoDecodeGap(context: string): Promise<void> {
  const [cards, sqlCount] = await Promise.all([
    listAllCards(),
    countAllCards(),
  ]);
  expect(cards.length, `${context}: decode gap`).toBe(sqlCount);
}

export async function assertNoCategoryDecodeGap(context: string): Promise<void> {
  const [categories, sqlCount] = await Promise.all([
    listAllCategories(),
    countCategories(),
  ]);
  expect(categories.length, `${context}: category decode gap`).toBe(sqlCount);
}
