import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import type { Card } from "@/lib/spaced-repetition";
import { notifyCardsChanged } from "@/lib/db/queries";
import * as dbQueries from "@/lib/db/queries";
import * as eventBus from "@/lib/event-bus";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { metrics } from "@/lib/metrics";
import { runBulkCardsWrite } from "@/lib/query/all-caches-coordinator";
import { resetBulkWriteDepthForTest } from "@/lib/query/bulk-write-session-depth";
import {
  _resetBridgesForTest,
  installQueryBridges,
} from "@/lib/query/bridges";
import { resetCardsQueryCache } from "@/lib/query/cards-cache-coordinator";

describe("bulk write session", () => {
  beforeEach(() => {
    metrics.reset();
    _resetBridgesForTest();
    installQueryBridges(queryClient);
  });

  afterEach(() => {
    resetBulkWriteDepthForTest();
    resetCardsQueryCache();
    _resetBridgesForTest();
    vi.restoreAllMocks();
  });

  it("seeds cards.all from SQLite without prefix bridge flush", async () => {
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

    const prefixBefore = metrics.snapshot().counters["bridges.cards.flush.prefix"] ?? 0;

    await runBulkCardsWrite(async () => undefined);

    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(cards);
    const prefixAfter = metrics.snapshot().counters["bridges.cards.flush.prefix"] ?? 0;
    expect(prefixAfter - prefixBefore).toBe(0);
  });

  it("suppresses scoped notifyCardsChanged during work phase", async () => {
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue([]);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(0);
    const emitSpy = vi.spyOn(eventBus, "emitDomainChanged");

    await runBulkCardsWrite(async () => {
      notifyCardsChanged({ kind: "all" });
      const allCardEmits = emitSpy.mock.calls.filter(
        (args) =>
          (args[0] as { domain?: string; scope?: { kind?: string } }).domain ===
            "cards" &&
          (args[0] as { scope?: { kind?: string } }).scope?.kind === "all",
      );
      expect(allCardEmits).toHaveLength(0);
    });

    expect(
      emitSpy.mock.calls.some(
        (args) =>
          (args[0] as { domain?: string; scope?: { kind?: string } }).domain ===
            "cards" &&
          (args[0] as { scope?: { kind?: string } }).scope?.kind === "derived",
      ),
    ).toBe(true);
  });
});
