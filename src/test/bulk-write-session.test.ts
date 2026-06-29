import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import type { Card } from "@/lib/spaced-repetition";
import { notifyCardsChanged } from "@/lib/db/queries";
import * as dbQueries from "@/lib/db/queries";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { runBulkCardsWrite } from "@/lib/query/write-session";
import { resetBulkWriteDepthForTest } from "@/lib/query/write-session";
import { resetCardsQueryCache } from "@/lib/query/cache-coordinator";

describe("bulk write session", () => {
  beforeEach(() => {
    resetCardsQueryCache();
  });

  afterEach(() => {
    resetBulkWriteDepthForTest();
    resetCardsQueryCache();
    vi.restoreAllMocks();
  });

  it("seeds cards.all from SQLite without prefix invalidation", async () => {
    const cards: Card[] = [
      {
        id: "c1",
        question: "q",
        sections: [],
        categoryId: "cat",
        createdAt: 0,
        readCount: 0,
        type: "essay",
      } as Card,
    ];
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(cards);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await runBulkCardsWrite(async () => undefined);

    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(cards);
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["cards"] });
  });

  it("suppresses scoped notifyCardsChanged during work phase", async () => {
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue([]);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(0);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await runBulkCardsWrite(async () => {
      notifyCardsChanged({ kind: "all" });
      const prefixCalls = invalidateSpy.mock.calls.filter(
        ([arg]) =>
          (arg as { queryKey?: unknown[] }).queryKey?.[0] === "cards"
          && (arg as { queryKey?: unknown[] }).queryKey?.length === 1,
      );
      expect(prefixCalls).toHaveLength(0);
    });

    expect(
      invalidateSpy.mock.calls.some(
        ([arg]) =>
          typeof (arg as { predicate?: unknown }).predicate === "function",
      ),
    ).toBe(true);
  });
});
