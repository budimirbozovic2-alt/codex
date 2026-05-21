import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardsBySource } from "@/store/useCardsBySource";
import { replaceCardMap, setCardMap } from "@/store/useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";
import type { CardMap } from "@/lib/persist-queue";

function makeCard(id: string, sourceId?: string): Card {
  return {
    id,
    categoryId: "cat-1",
    subcategoryId: "",
    chapterId: "",
    tags: [],
    sourceId,
    sections: [],
  } as unknown as Card;
}

beforeEach(() => {
  replaceCardMap({});
});

describe("useCardsBySource", () => {
  it("returns frozen empty array for undefined sourceId", () => {
    const { result } = renderHook(() => useCardsBySource(undefined));
    expect(result.current).toEqual([]);
    expect(Object.isFrozen(result.current)).toBe(true);
  });

  it("returns empty array when no cards in store", () => {
    const { result } = renderHook(() => useCardsBySource("src-1"));
    expect(result.current).toEqual([]);
  });

  it("returns only cards with matching sourceId", () => {
    replaceCardMap({
      a: makeCard("a", "src-1"),
      b: makeCard("b", "src-2"),
      c: makeCard("c", "src-1"),
      d: makeCard("d"),
    });
    const { result } = renderHook(() => useCardsBySource("src-1"));
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "c"]);
  });

  it("returns a stable reference across re-renders when store is unchanged", () => {
    replaceCardMap({ a: makeCard("a", "src-1") });
    const { result, rerender } = renderHook(() => useCardsBySource("src-1"));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("does NOT produce a new reference when an unrelated card mutates", () => {
    const cardA = makeCard("a", "src-1");
    replaceCardMap({ a: cardA, b: makeCard("b", "src-2") });
    const { result } = renderHook(() => useCardsBySource("src-1"));
    const before = result.current;
    expect(before.map((c) => c.id)).toEqual(["a"]);

    // Mutate an unrelated card (different sourceId) → new map root, but
    // matched set is identical → selector must return the SAME array.
    act(() => {
      setCardMap((prev: CardMap) => ({ ...prev, b: makeCard("b", "src-2") }));
    });
    expect(result.current).toBe(before);
  });

  it("produces a new reference when a matched card is replaced", () => {
    replaceCardMap({ a: makeCard("a", "src-1") });
    const { result } = renderHook(() => useCardsBySource("src-1"));
    const before = result.current;

    act(() => {
      setCardMap((prev: CardMap) => ({ ...prev, a: makeCard("a", "src-1") }));
    });
    expect(result.current).not.toBe(before);
    expect(result.current.map((c) => c.id)).toEqual(["a"]);
  });

  it("grows the array when a new matching card is added", () => {
    replaceCardMap({ a: makeCard("a", "src-1") });
    const { result } = renderHook(() => useCardsBySource("src-1"));
    const before = result.current;
    expect(before).toHaveLength(1);

    act(() => {
      setCardMap((prev: CardMap) => ({ ...prev, z: makeCard("z", "src-1") }));
    });
    expect(result.current).not.toBe(before);
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "z"]);
  });

  it("shrinks the array when a matching card is deleted", () => {
    replaceCardMap({
      a: makeCard("a", "src-1"),
      b: makeCard("b", "src-1"),
    });
    const { result } = renderHook(() => useCardsBySource("src-1"));
    expect(result.current).toHaveLength(2);

    act(() => {
      setCardMap((prev: CardMap) => {
        const next = { ...prev };
        delete next.a;
        return next;
      });
    });
    expect(result.current.map((c) => c.id)).toEqual(["b"]);
  });
});
