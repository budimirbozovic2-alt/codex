import { describe, expect, it, afterEach, vi } from "vitest";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import type { Card } from "@/lib/spaced-repetition";
import * as dbQueries from "@/lib/db/queries";
import {
  abortCardsWrite,
  beginCardsWrite,
  commitCardsWriteFromDb,
  commitDeferredBootSeed,
  ensureCardsBootCache,
  getCardsCacheWriteGeneration,
  getCardsHydrated,
  resetCardsQueryCache,
  seedCardsQueryCache,
} from "@/lib/query/cards-cache-coordinator";

const FRESH: Card[] = [{ id: "fresh" } as Card];

describe("cards-cache-coordinator", () => {
  afterEach(() => {
    resetCardsQueryCache();
    vi.restoreAllMocks();
  });

  it("resetCardsQueryCache clears stale card queries", () => {
    queryClient.setQueryData(queryKeys.cards.all(), [{ id: "stale" } as Card]);
    queryClient.setQueryData(queryKeys.cards.countAll(), 1);
    seedCardsQueryCache([{ id: "stale" } as Card]);
    expect(getCardsHydrated()).toBe(true);

    resetCardsQueryCache();

    expect(queryClient.getQueryData(queryKeys.cards.all())).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.cards.countAll())).toBeUndefined();
    expect(getCardsHydrated()).toBe(false);
  });

  it("seedCardsQueryCache seeds all + count from authoritative rows", () => {
    const cards = [{ id: "a" }, { id: "b" }] as Card[];
    seedCardsQueryCache(cards);

    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(cards);
    expect(queryClient.getQueryData(queryKeys.cards.countAll())).toBe(2);
    expect(getCardsHydrated()).toBe(true);
  });

  it("beginCardsWrite bumps generation and deferred seed respects it", () => {
    const bootGen = getCardsCacheWriteGeneration();
    beginCardsWrite();
    expect(commitDeferredBootSeed([{ id: "stale" } as Card], bootGen)).toBe(false);
    expect(seedCardsQueryCache([{ id: "new" } as Card])).toBe(true);
  });

  it("commitCardsWriteFromDb seeds without invalidate/refetch", async () => {
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);
    vi.spyOn(dbQueries, "notifyCardsChanged").mockImplementation(() => {});

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const refetchSpy = vi.spyOn(queryClient, "refetchQueries");
    const count = await commitCardsWriteFromDb();
    expect(count).toBe(1);
    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(FRESH);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(refetchSpy).not.toHaveBeenCalled();
  });

  it("commitCardsWriteFromDb notifies derived-only invalidation", async () => {
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);
    const notifySpy = vi
      .spyOn(dbQueries, "notifyCardsChanged")
      .mockImplementation(() => {});

    await commitCardsWriteFromDb();
    expect(notifySpy).toHaveBeenCalledWith({ kind: "derived" });
    expect(notifySpy).not.toHaveBeenCalledWith({ kind: "all" });
  });

  it("abortCardsWrite resyncs without generation guard", async () => {
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);
    vi.spyOn(dbQueries, "notifyCardsChanged").mockImplementation(() => {});

    beginCardsWrite();
    const count = await abortCardsWrite();
    expect(count).toBe(1);
    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(FRESH);
  });

  it("ensureCardsBootCache hydrates via direct SQLite read before READY", async () => {
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);

    const gen = getCardsCacheWriteGeneration();
    const count = await ensureCardsBootCache(gen);
    expect(count).toBe(1);
    expect(getCardsHydrated()).toBe(true);
    expect(queryClient.getQueryData(queryKeys.cards.countAll())).toBe(1);
    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(FRESH);
  });

  it("ensureCardsBootCache skips stale seed when import bumped generation", async () => {
    vi.spyOn(dbQueries, "listAllCards").mockResolvedValue(FRESH);
    vi.spyOn(dbQueries, "countAllCards").mockResolvedValue(1);

    const gen = getCardsCacheWriteGeneration();
    beginCardsWrite();
    const count = await ensureCardsBootCache(gen);
    expect(count).toBe(-1);
    expect(getCardsHydrated()).toBe(false);
  });
});
