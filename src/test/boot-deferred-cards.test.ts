// Phase 1 boot deferral — verify `loadInitialData` no longer pulls the
// full cards table over the worker. `loadCardsDeferred` is the new
// post-READY entrypoint and still resolves via `listAllCards`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { INTEGRATION_TEST_TIMEOUT_MS } from "./helpers/test-timeouts";

// Mock heavy deps before importing the unit under test.
vi.mock("@/lib/db-seed", () => ({ seedDefaultCategories: vi.fn(async () => []) }));
vi.mock("@/lib/repositories", () => ({
  reviewLogRepository: { loadRecent: vi.fn(async () => []) },
  settingsRepository: { load: vi.fn(async (_k: string, dflt: unknown) => dflt) },
}));
vi.mock("@/domains/metacognition/metacognitive-storage", () => ({ initMetacognitiveCache: vi.fn(async () => {}) }));
vi.mock("@/domains/planner", () => ({ initPlannerCache: vi.fn(async () => {}) }));
vi.mock("@/domains/subjects/subject-settings", () => ({ initSubjectSettingsCache: vi.fn(async () => {}) }));
vi.mock("@/lib/boot", () => ({ transition: vi.fn() }));
vi.mock("@/lib/boot-trace", () => ({ markBootStep: vi.fn() }));
vi.mock("@/hooks/card-bootstrap/splash", () => ({ splashProgress: vi.fn() }));

const listAllCardsMock = vi.fn();
vi.mock("@/lib/db/queries", () => ({ listAllCards: listAllCardsMock }));

describe("boot: deferred cards (Phase 1)", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    listAllCardsMock.mockReset();
  });

  it("loadInitialData does NOT call listAllCards on the critical path", async () => {
    const { loadInitialData } = await import("@/hooks/card-bootstrap/loadInitialData");
    listAllCardsMock.mockResolvedValue([{ id: "c1" }]);

    const result = await loadInitialData();

    expect(listAllCardsMock).not.toHaveBeenCalled();
    expect(result.cards).toEqual([]);
    expect(result.catRecords).toEqual([]);
  });

  it("loadCardsDeferred reads via listAllCards (post-READY entrypoint)", async () => {
    const { loadCardsDeferred } = await import("@/hooks/card-bootstrap/loadInitialData");
    listAllCardsMock.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);

    const cards = await loadCardsDeferred();
    expect(listAllCardsMock).toHaveBeenCalledTimes(1);
    expect(cards).toHaveLength(2);
  });
});
