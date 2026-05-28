// Regression test for C4 deletion bug (ported to cardMapWrites after B1):
// `delete cardMapRefFacade.current[id]` happened BEFORE `setCardMap(prev=>…)`,
// and because the facade and the store share the same atom, the
// `if (!prev[id]) return prev` guard short-circuited — no notify, UI never
// re-rendered the deletion even though the card was gone from the in-memory
// map. Now covered against the post-B1 `cardMapWrites` primitives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// F6.1: stale `@/lib/db` mock removed — cardMapWrites routes through
// `@/lib/db/queries` and never touched these legacy helpers post-B1.


vi.mock("@/lib/coverage-analysis", () => ({
  invalidateCoverageCache: vi.fn(),
}));

import {
  put,
  bulkPut,
  remove,
  applySyncDelta,
} from "@/lib/cards/cardMapWrites";
import { cardMapStore, getCardMap, replaceCardMap, cardMapRefFacade } from "@/store/useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";

const mkCard = (id: string): Card => ({ id, question: `q-${id}`, sections: [], categoryId: "c1" } as unknown as Card);

describe("cardMapWrites — store/ref unified atom (C4 regression)", () => {
  beforeEach(() => replaceCardMap({}));
  afterEach(() => replaceCardMap({}));

  it("remove() emits a store notification with a NEW reference", () => {
    put(mkCard("a"));
    put(mkCard("b"));
    const before = getCardMap();
    expect(before.a).toBeDefined();

    const seen: Record<string, Card>[] = [];
    const unsub = cardMapStore.subscribe((s) => { seen.push(s.cardMap); });

    remove("a");

    unsub();
    expect(seen.length).toBe(1);
    expect(seen[0]).not.toBe(before);     // new reference
    expect(seen[0].a).toBeUndefined();    // key gone
    expect(seen[0].b).toBeDefined();      // siblings intact
    expect(getCardMap().a).toBeUndefined();
    expect(cardMapRefFacade.current.a).toBeUndefined();
  });

  it("remove() of an unknown id is a no-op (no notification)", () => {
    put(mkCard("a"));
    const listener = vi.fn();
    const unsub = cardMapStore.subscribe(listener);
    remove("ghost");
    unsub();
    expect(listener).not.toHaveBeenCalled();
  });

  it("put/bulkPut/applySyncDelta produce a single notify and new reference", () => {
    const listener = vi.fn();
    const unsub = cardMapStore.subscribe(listener);

    put(mkCard("a"));
    bulkPut([mkCard("b"), mkCard("c")]);
    applySyncDelta([mkCard("d")], ["a"]);

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
