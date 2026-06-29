import { describe, expect, it, beforeEach } from "vitest";
import { makeCard, makeSection } from "@/test/factories";
import { cardRepository } from "@/lib/repositories";
import {
  listAllCards,
  countAllCards,
  countDueCardsFromDb,
  countDueCardsByCategoryFromDb,
} from "@/lib/db/queries";
import { SectionState } from "@/lib/spaced-repetition";
import {
  abortCardsWrite,
  beginCardsWrite,
  ensureCardsBootCache,
  getCardsCacheWriteGeneration,
  getCardsHydrated,
  resetCardsQueryCache,
} from "@/lib/query/cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { INTEGRATION_TEST_TIMEOUT_MS } from "@/test/helpers/test-timeouts";
import {
  assertNoDecodeGap,
  expectCardsCacheEmpty,
  simulateAppSessionReset,
} from "@/test/helpers/persistence-contract";

describe("cards persistence contract (harness)", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    resetCardsQueryCache();
  });

  it("single card survives session reset + boot rehydrate", async () => {
    const card = makeCard({ id: "persist-1", question: "Q?" });
    await cardRepository.put(card);

    expect(await countAllCards()).toBe(1);
    expect((await listAllCards()).map((c) => c.id)).toEqual(["persist-1"]);

    simulateAppSessionReset();
    expectCardsCacheEmpty();

    const gen = getCardsCacheWriteGeneration();
    const count = await ensureCardsBootCache(gen);
    expect(count).toBe(1);
    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "persist-1" })]),
    );
    expect(getCardsHydrated()).toBe(true);
  });

  it("bulk cards survive session reset", async () => {
    const cards = Array.from({ length: 12 }, (_, i) =>
      makeCard({ id: `bulk-${i}`, question: `Q${i}?` }),
    );
    await cardRepository.bulkPut(cards);

    expect(await countAllCards()).toBe(12);
    simulateAppSessionReset();
    expectCardsCacheEmpty();

    const gen = getCardsCacheWriteGeneration();
    const count = await ensureCardsBootCache(gen);
    expect(count).toBe(12);
    const cached = queryClient.getQueryData<readonly { id: string }[]>(
      queryKeys.cards.all(),
    );
    expect(cached?.map((c) => c.id).sort()).toEqual(
      cards.map((c) => c.id).sort(),
    );
  });

  it("no decode gap after rehydrate", async () => {
    await cardRepository.put(makeCard({ id: "decode-1" }));
    await cardRepository.put(makeCard({ id: "decode-2" }));

    simulateAppSessionReset();
    const gen = getCardsCacheWriteGeneration();
    await ensureCardsBootCache(gen);

    await assertNoDecodeGap("after ensureCardsBootCache");
    const cached = queryClient.getQueryData(queryKeys.cards.all()) as unknown[];
    expect(cached?.length).toBe(2);
  });

  it("card_sections + due query survive session reset", async () => {
    const now = Date.now();
    const dueSection = makeSection({ html: "<p>due</p>" });
    dueSection.state = SectionState.Review;
    dueSection.nextReview = now - 60_000;

    const card = makeCard({
      id: "due-card",
      categoryId: "cat_due",
      sections: [dueSection],
    });
    await cardRepository.put(card);

    expect(await countDueCardsFromDb(now)).toBe(1);
    expect(await countDueCardsByCategoryFromDb("cat_due", now)).toBe(1);

    simulateAppSessionReset();
    expectCardsCacheEmpty();
    expect(await countDueCardsFromDb(now)).toBe(1);

    const gen = getCardsCacheWriteGeneration();
    await ensureCardsBootCache(gen);
    await assertNoDecodeGap("due card rehydrate");
  });

  it("stale TanStack seed is ignored on boot", async () => {
    await cardRepository.put(makeCard({ id: "stale-1" }));

    queryClient.setQueryData(queryKeys.cards.all(), []);
    queryClient.setQueryData(queryKeys.cards.countAll(), 0);

    const gen = getCardsCacheWriteGeneration();
    const count = await ensureCardsBootCache(gen);
    expect(count).toBe(1);
    expect(
      (queryClient.getQueryData(queryKeys.cards.all()) as { id: string }[])?.map(
        (c) => c.id,
      ),
    ).toEqual(["stale-1"]);
  });

  it("concurrent import generation blocks stale boot seed", async () => {
    await cardRepository.put(makeCard({ id: "race-1" }));

    const genAtStart = getCardsCacheWriteGeneration();
    beginCardsWrite();

    const count = await ensureCardsBootCache(genAtStart);
    expect(count).toBe(-1);
    expect(getCardsHydrated()).toBe(false);
  });

  it("abortCardsWrite recovers hydrated cache after failed write gen", async () => {
    await cardRepository.put(makeCard({ id: "recover-1" }));

    const genAtStart = getCardsCacheWriteGeneration();
    beginCardsWrite();
    expect(await ensureCardsBootCache(genAtStart)).toBe(-1);
    expect(getCardsHydrated()).toBe(false);

    const recovered = await abortCardsWrite();
    expect(recovered).toBe(1);
    expect(getCardsHydrated()).toBe(true);
    expect(
      (queryClient.getQueryData(queryKeys.cards.all()) as { id: string }[])?.map(
        (c) => c.id,
      ),
    ).toEqual(["recover-1"]);
  });
});
