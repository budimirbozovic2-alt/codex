// Phase 1 — selector behavior + stable-reference guarantee.
// Tests target the RAM exports directly so Phase 2's IDB-routing façade does
// not require fake-indexeddb here. Façade routing is covered separately.
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useCardsByCategoryRam as useCardsByCategory,
  useCardsBySubcategoryRam as useCardsBySubcategory,
  useCardsByChapterRam as useCardsByChapter,
  useCardCountByCategoryRam as useCardCountByCategory,
} from "@/store/useCardSelectors";
import { cardMapStore } from "@/store/useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";

function card(p: Partial<Card> & { id: string; categoryId: string }): Card {
  return {
    id: p.id,
    question: p.id,
    sections: [],
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId,
    chapterId: p.chapterId,
    createdAt: 0,
    readCount: 0,
    type: "essay",
  };
}

describe("Phase 1 — granular card selectors", () => {
  beforeEach(() => {
    cardMapStore.setState({ cardMap: {} });
  });

  it("useCardsByCategory returns only matching cards", () => {
    cardMapStore.setState({
      cardMap: {
        a: card({ id: "a", categoryId: "X" }),
        b: card({ id: "b", categoryId: "Y" }),
        c: card({ id: "c", categoryId: "X" }),
      },
    });
    const { result } = renderHook(() => useCardsByCategory("X"));
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "c"]);
  });

  it("returns same array reference when unrelated card mutates", () => {
    cardMapStore.setState({
      cardMap: {
        a: card({ id: "a", categoryId: "X" }),
        b: card({ id: "b", categoryId: "Y" }),
      },
    });
    const { result, rerender } = renderHook(() => useCardsByCategory("X"));
    const first = result.current;

    // Mutate a card in category Y — should NOT change category X's result.
    act(() => {
      cardMapStore.setState({
        cardMap: {
          ...cardMapStore.getState().cardMap,
          b: card({ id: "b", categoryId: "Y", question: "updated" }),
        },
      });
    });
    rerender();
    expect(result.current).toBe(first);
  });

  it("allocates new array when matched set membership changes", () => {
    cardMapStore.setState({
      cardMap: { a: card({ id: "a", categoryId: "X" }) },
    });
    const { result, rerender } = renderHook(() => useCardsByCategory("X"));
    const first = result.current;

    act(() => {
      cardMapStore.setState({
        cardMap: {
          ...cardMapStore.getState().cardMap,
          c: card({ id: "c", categoryId: "X" }),
        },
      });
    });
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.length).toBe(2);
  });

  it("useCardsBySubcategory / useCardsByChapter filter correctly", () => {
    cardMapStore.setState({
      cardMap: {
        a: card({ id: "a", categoryId: "X", subcategoryId: "S1", chapterId: "CH1" }),
        b: card({ id: "b", categoryId: "X", subcategoryId: "S2", chapterId: "CH2" }),
        c: card({ id: "c", categoryId: "X", subcategoryId: "S1", chapterId: "CH2" }),
      },
    });
    const { result: bySub } = renderHook(() => useCardsBySubcategory("S1"));
    const { result: byCh } = renderHook(() => useCardsByChapter("CH2"));
    expect(bySub.current.map((c) => c.id).sort()).toEqual(["a", "c"]);
    expect(byCh.current.map((c) => c.id).sort()).toEqual(["b", "c"]);
  });

  it("useCardCountByCategory returns primitive count", () => {
    cardMapStore.setState({
      cardMap: {
        a: card({ id: "a", categoryId: "X" }),
        b: card({ id: "b", categoryId: "X" }),
        c: card({ id: "c", categoryId: "Y" }),
      },
    });
    const { result } = renderHook(() => useCardCountByCategory("X"));
    expect(result.current).toBe(2);
  });

  it("returns EMPTY when key is undefined or empty", () => {
    cardMapStore.setState({
      cardMap: { a: card({ id: "a", categoryId: "X" }) },
    });
    const { result: r1 } = renderHook(() => useCardsByCategory(undefined));
    const { result: r2 } = renderHook(() => useCardsByCategory(""));
    expect(r1.current).toEqual([]);
    expect(r2.current).toEqual([]);
  });
});
