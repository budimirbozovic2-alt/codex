// Regression test for C4 deletion bug:
// `delete cardMapRefFacade.current[id]` happened BEFORE `setCardMap(prev=>…)`,
// and because the facade and the store share the same atom, the `if (!prev[id])
// return prev` guard short-circuited — no notify, UI never re-rendered the
// deletion even though the card was gone from the in-memory map.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  idbBulkApply: vi.fn().mockResolvedValue(undefined),
  idbBulkPutCards: vi.fn().mockResolvedValue(undefined),
  idbDeleteCard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/coverage-analysis", () => ({
  invalidateCoverageCache: vi.fn(),
}));

import { cardRepository } from "@/lib/repositories/cardRepository";
import { cardMapStore, getCardMap, replaceCardMap, cardMapRefFacade } from "@/store/useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";

const mkCard = (id: string): Card => ({ id, question: `q-${id}`, sections: [], categoryId: "c1" } as unknown as Card);

describe("cardRepository — store/ref unified atom (C4)", () => {
  beforeEach(() => replaceCardMap({}));
  afterEach(() => replaceCardMap({}));

  it("remove() emits a store notification with a NEW reference", () => {
    cardRepository.put(mkCard("a"));
    cardRepository.put(mkCard("b"));
    const before = getCardMap();
    expect(before.a).toBeDefined();

    const seen: Record<string, Card>[] = [];
    const unsub = cardMapStore.subscribe((s) => { seen.push(s.cardMap); });

    cardRepository.remove("a");

    unsub();
    expect(seen.length).toBe(1);
    expect(seen[0]).not.toBe(before);     // new reference
    expect(seen[0].a).toBeUndefined();    // key gone
    expect(seen[0].b).toBeDefined();      // siblings intact
    expect(getCardMap().a).toBeUndefined();
    expect(cardMapRefFacade.current.a).toBeUndefined();
  });

  it("remove() of an unknown id is a no-op (no notification)", () => {
    cardRepository.put(mkCard("a"));
    const listener = vi.fn();
    const unsub = cardMapStore.subscribe(listener);
    cardRepository.remove("ghost");
    unsub();
    expect(listener).not.toHaveBeenCalled();
  });

  it("put/bulkPut/applySyncDelta produce a single notify and new reference", () => {
    const listener = vi.fn();
    const unsub = cardMapStore.subscribe(listener);

    cardRepository.put(mkCard("a"));
    cardRepository.bulkPut([mkCard("b"), mkCard("c")]);
    cardRepository.applySyncDelta([mkCard("d")], ["a"]);

    unsub();
    expect(listener).toHaveBeenCalledTimes(3);
    const final = getCardMap();
    expect(final.a).toBeUndefined();
    expect(final.b).toBeDefined();
    expect(final.c).toBeDefined();
    expect(final.d).toBeDefined();
    expect(cardMapRefFacade.current).toBe(final);
  });
});
