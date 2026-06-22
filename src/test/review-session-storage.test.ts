import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveReviewSession,
  loadSavedReviewSession,
  clearSavedReviewSession,
  type SavedReviewSession,
} from "@/domains/review/review-session-storage";
import { resetTestSqliteState } from "@/test/sqlite-harness";

vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  const store = new Map<string, unknown>();
  return {
    ...actual,
    getSetting: vi.fn(async <T,>(key: string) => (store.get(key) as T | undefined) ?? null),
    putSetting: vi.fn(async (key: string, value: unknown) => {
      if (value === null) store.delete(key);
      else store.set(key, value);
    }),
  };
});

describe("review-session-storage", () => {
  beforeEach(() => {
    resetTestSqliteState();
    vi.clearAllMocks();
  });

  it("save/load round-trip returns fresh session", async () => {
    const state: SavedReviewSession = {
      mode: "stabilization",
      randomIndex: 3,
      timestamp: Date.now(),
    };
    await saveReviewSession(state);
    const loaded = await loadSavedReviewSession();
    expect(loaded?.mode).toBe("stabilization");
    expect(loaded?.randomIndex).toBe(3);
  });

  it("clear removes saved session", async () => {
    await saveReviewSession({
      mode: "critical",
      randomIndex: 0,
      timestamp: Date.now(),
    });
    await clearSavedReviewSession();
    const loaded = await loadSavedReviewSession();
    expect(loaded).toBeNull();
  });

  it("rejects stale sessions beyond TTL", async () => {
    const stale: SavedReviewSession = {
      mode: "hardest",
      randomIndex: 1,
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
    };
    await saveReviewSession(stale);
    const loaded = await loadSavedReviewSession();
    expect(loaded).toBeNull();
  });
});
