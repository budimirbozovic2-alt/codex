import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureCardsBootCache: vi.fn(async () => 42),
  commitCardsWriteFromDb: vi.fn(async () => 42),
  getCardsCacheWriteGeneration: vi.fn(() => 0),
  getCardsHydrated: vi.fn(() => true),
  getCardsFromQueryCache: vi.fn(() => []),
  transition: vi.fn(),
}));

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
vi.mock("@/lib/repositories", () => ({
  categoryRepository: {
    replaceAll: vi.fn(),
    commit: vi.fn(async () => {}),
  },
}));
vi.mock("@/lib/query/review-settings-cache-coordinator", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/query/review-settings-cache-coordinator")
  >();
  return {
    ...actual,
    seedReviewLogCache: vi.fn(actual.seedReviewLogCache),
    seedSrSettingsCache: vi.fn(actual.seedSrSettingsCache),
  };
});
vi.mock("@/lib/boot", () => ({
  transition: mocks.transition,
  getBootState: vi.fn(() => ({ type: "loading" })),
}));
vi.mock("@/lib/boot-trace", () => ({ markBootStep: vi.fn() }));
vi.mock("@/lib/query/cards-cache-coordinator", () => ({
  ensureCardsBootCache: mocks.ensureCardsBootCache,
  commitCardsWriteFromDb: mocks.commitCardsWriteFromDb,
  getCardsCacheWriteGeneration: mocks.getCardsCacheWriteGeneration,
  getCardsHydrated: mocks.getCardsHydrated,
  getCardsFromQueryCache: mocks.getCardsFromQueryCache,
  abortCardsWrite: vi.fn(),
  seedCardsQueryCache: vi.fn(),
}));

import { runBootDag } from "@/hooks/card-bootstrap/boot-dag";

describe("runBootDag Paket C", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCardsCacheWriteGeneration.mockReturnValue(0);
    mocks.ensureCardsBootCache.mockResolvedValue(42);
  });

  it("calls ensureCardsBootCache before READY transition", async () => {
    const ac = new AbortController();
    await runBootDag(ac.signal);

    expect(mocks.ensureCardsBootCache).toHaveBeenCalledWith(0, ac.signal);
    expect(mocks.transition).toHaveBeenCalledWith({ type: "READY" });

    const ensureOrder = mocks.ensureCardsBootCache.mock.invocationCallOrder[0];
    const readyOrder = mocks.transition.mock.calls.findIndex(
      (call) => call[0]?.type === "READY",
    );
    const readyInvocationOrder = mocks.transition.mock.invocationCallOrder[readyOrder];
    expect(ensureOrder).toBeLessThan(readyInvocationOrder);
  });

  it("retries ensureCardsBootCache then commitCardsWriteFromDb with current generation", async () => {
    mocks.getCardsCacheWriteGeneration
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1);
    mocks.ensureCardsBootCache
      .mockResolvedValueOnce(-1)
      .mockResolvedValueOnce(-1);
    await runBootDag(new AbortController().signal);
    expect(mocks.ensureCardsBootCache).toHaveBeenNthCalledWith(1, 0, expect.any(AbortSignal));
    expect(mocks.ensureCardsBootCache).toHaveBeenNthCalledWith(2, 1, expect.any(AbortSignal));
    expect(mocks.commitCardsWriteFromDb).toHaveBeenCalledWith(1);
  });
});
