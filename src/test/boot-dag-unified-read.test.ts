import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeCard } from "@/test/factories";
import { putCardDirect, bulkPutCategories } from "@/lib/db/queries";
import {
  ensureCardsBootCache,
  getCardsHydrated,
  resetCardsQueryCache,
} from "@/lib/query/cards-cache-coordinator";
import {
  ensureCategoriesBootCache,
  getCategoriesHydrated,
  resetCategoriesQueryCache,
} from "@/lib/query/categories-cache-coordinator";
import {
  resetReviewSettingsQueryCache,
  REVIEW_LOG_BOOT_DAYS,
} from "@/lib/query/review-settings-cache-coordinator";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { __resetBootStateForTests, getBootState } from "@/lib/boot";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@/test/helpers/test-timeouts";
import { simulateAppSessionReset } from "@/test/helpers/persistence-contract";

vi.mock("@/hooks/card-bootstrap/bootDb", () => ({
  bootDb: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/hooks/card-bootstrap/runSchema", () => ({
  runSchema: vi.fn(async () => {}),
  SchemaError: class SchemaError extends Error {},
}));
vi.mock("@/hooks/card-bootstrap/loadInitialData", () => ({
  loadInitialData: vi.fn(async () => ({
    cards: [],
    catRecords: [{ id: "boot-cat", name: "Boot Cat", sortOrder: 0, subcategories: [] }],
    log: [
      {
        cardId: "boot-card",
        sectionId: "sec",
        grade: 3,
        timestamp: 1000,
        category: "boot-cat",
      },
    ],
    settings: { ...DEFAULT_SR_SETTINGS, maxNewPerDay: 7 },
  })),
}));
vi.mock("@/hooks/card-bootstrap/splash", () => ({
  splashProgress: vi.fn(),
  showSplashError: vi.fn(),
}));
vi.mock("@/lib/boot-trace", () => ({ markBootStep: vi.fn() }));

import { runBootDag } from "@/hooks/card-bootstrap/boot-dag";

describe("boot DAG unified read", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    resetCardsQueryCache();
    resetCategoriesQueryCache();
    resetReviewSettingsQueryCache();
    __resetBootStateForTests();
    await bulkPutCategories([
      { id: "sql-cat", name: "SQL Cat", sortOrder: 0, subcategories: [] },
    ]);
    await putCardDirect(makeCard({ id: "sql-card", question: "Q?" }));
    simulateAppSessionReset({ resetBoot: true });
  });

  it("hydrates cards, categories, review log and sr settings before READY", async () => {
    await runBootDag(new AbortController().signal);

    expect(getBootState().type).toBe("ready");
    expect(getCardsHydrated()).toBe(true);
    expect(getCategoriesHydrated()).toBe(true);

    const cards = queryClient.getQueryData(queryKeys.cards.all()) as
      | { id: string }[]
      | undefined;
    expect(cards?.map((c) => c.id)).toContain("sql-card");

    const categories = queryClient.getQueryData(queryKeys.categories.all()) as
      | { id: string }[]
      | undefined;
    expect(categories?.length).toBeGreaterThan(0);

    const log = queryClient.getQueryData(
      queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS),
    ) as { cardId: string }[] | undefined;
    expect(log?.some((e) => e.cardId === "boot-card")).toBe(true);

    const settings = queryClient.getQueryData(queryKeys.settings.sr()) as
      | { maxNewPerDay?: number }
      | undefined;
    expect(settings?.maxNewPerDay).toBe(7);
  });
});
