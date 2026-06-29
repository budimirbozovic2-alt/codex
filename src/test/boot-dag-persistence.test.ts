import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeCard } from "@/test/factories";
import { cardRepository } from "@/lib/repositories";
import {
  ensureCardsBootCache,
  getCardsHydrated,
  resetCardsQueryCache,
} from "@/lib/query/cache-coordinator";
import {
  ensureCategoriesBootCache,
  getCategoriesHydrated,
  resetCategoriesQueryCache,
} from "@/lib/query/cache-coordinator";
import * as cardsCacheCoordinator from "@/lib/query/cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { __resetBootStateForTests, getBootState } from "@/lib/boot";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@/test/helpers/test-timeouts";
import {
  assertNoDecodeGap,
  assertNoCategoryDecodeGap,
  simulateAppSessionReset,
} from "@/test/helpers/persistence-contract";

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
    catRecords: [{ id: "c1", name: "Test", sortOrder: 0, subcategories: [] }],
    log: [],
    settings: {},
  })),
}));
vi.mock("@/hooks/card-bootstrap/splash", () => ({
  splashProgress: vi.fn(),
  showSplashError: vi.fn(),
}));
vi.mock("@/lib/repositories", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories")>(
    "@/lib/repositories",
  );
  return {
    ...actual,
    categoryRepository: {
      ...actual.categoryRepository,
      replaceAll: vi.fn(actual.categoryRepository.replaceAll),
    },
  };
});
vi.mock("@/lib/query/cache-coordinator", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/query/cache-coordinator")
  >();
  return {
    ...actual,
    seedReviewLogCache: vi.fn(actual.seedReviewLogCache),
    seedSrSettingsCache: vi.fn(actual.seedSrSettingsCache),
  };
});
vi.mock("@/lib/boot-trace", () => ({ markBootStep: vi.fn() }));

import { runBootDag } from "@/lib/boot";

describe("runBootDag persistence (harness)", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  const seedIds = ["boot-persist-1", "boot-persist-2", "boot-persist-3"];

  beforeEach(async () => {
    resetCardsQueryCache();
    resetCategoriesQueryCache();
    __resetBootStateForTests();
    for (const id of seedIds) {
      await cardRepository.put(makeCard({ id, question: `${id}?` }));
    }
    simulateAppSessionReset({ resetBoot: true });
  });

  it("hydrates cards and categories before READY", async () => {
    await runBootDag(new AbortController().signal);

    expect(getBootState().type).toBe("ready");
    expect(getCardsHydrated()).toBe(true);
    expect(getCategoriesHydrated()).toBe(true);

    const cached = queryClient.getQueryData(queryKeys.cards.all()) as
      | { id: string }[]
      | undefined;
    const cachedIds = cached?.map((c) => c.id).sort() ?? [];
    expect(cachedIds).toEqual([...seedIds].sort());
  });

  it("sqlCount matches cache length after boot", async () => {
    await runBootDag(new AbortController().signal);
    await assertNoDecodeGap("runBootDag");
    await assertNoCategoryDecodeGap("runBootDag");
  });

  it("retry path uses commitCardsWriteFromDb when ensureCardsBootCache fails", async () => {
    const ensureSpy = vi
      .spyOn(cardsCacheCoordinator, "ensureCardsBootCache")
      .mockResolvedValueOnce(-1)
      .mockResolvedValueOnce(-1);
    const commitSpy = vi.spyOn(cardsCacheCoordinator, "commitCardsWriteFromDb");

    await runBootDag(new AbortController().signal);

    expect(ensureSpy).toHaveBeenCalledTimes(2);
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(getBootState().type).toBe("ready");
    expect(getCardsHydrated()).toBe(true);

    ensureSpy.mockRestore();
    commitSpy.mockRestore();
  });
});
