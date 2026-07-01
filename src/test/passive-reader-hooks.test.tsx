import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { SubcategoryNode } from "@/lib/db-types";
import { makeCard } from "./factories";
import { usePassiveReaderNavigation } from "@/components/subject-cards/passive-reader/usePassiveReaderNavigation";
import type { PassiveReaderFiltersAPI } from "@/components/subject-cards/passive-reader/usePassiveReaderFilters";

const storage = new Map<string, unknown>();

vi.mock("@/lib/query/prefs-cache-coordinator", () => ({
  readPref: <T,>(key: string, fallback: T): T =>
    (storage.has(key) ? storage.get(key) : fallback) as T,
  writePref: <T,>(key: string, value: T): void => {
    storage.set(key, value);
  },
}));

import { usePassiveReaderFilters } from "@/components/subject-cards/passive-reader/usePassiveReaderFilters";

const CAT_ID = "cat_passive_test";

function makeSubcategories(): SubcategoryNode[] {
  return [
    {
      id: "sub-1",
      name: "Potkategorija 1",
      sortOrder: 0,
      chapters: [
        { id: "ch-1", name: "Glava 1", sortOrder: 0 },
        { id: "ch-2", name: "Glava 2", sortOrder: 1 },
      ],
    },
    {
      id: "sub-2",
      name: "Potkategorija 2",
      sortOrder: 1,
      chapters: [],
    },
  ];
}

function makeFilters(overrides: Partial<PassiveReaderFiltersAPI> = {}): PassiveReaderFiltersAPI {
  return {
    subFilter: "all",
    chapterFilter: "all",
    typeFilter: "all",
    setSubFilter: vi.fn(),
    setChapterFilter: vi.fn(),
    setTypeFilter: vi.fn(),
    resetAll: vi.fn(),
    ...overrides,
  };
}

function fireArrow(key: "ArrowLeft" | "ArrowRight") {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("usePassiveReaderFilters", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("starts with default filters when cache is empty", () => {
    const { result } = renderHook(() =>
      usePassiveReaderFilters(CAT_ID, makeSubcategories()),
    );

    expect(result.current.subFilter).toBe("all");
    expect(result.current.chapterFilter).toBe("all");
    expect(result.current.typeFilter).toBe("all");
  });

  it("loads persisted filters from cache", () => {
    storage.set(`passive-reader-filters:${CAT_ID}`, {
      subFilter: "sub-1",
      chapterFilter: "ch-1",
      typeFilter: "flash",
    });

    const { result } = renderHook(() =>
      usePassiveReaderFilters(CAT_ID, makeSubcategories()),
    );

    expect(result.current.subFilter).toBe("sub-1");
    expect(result.current.chapterFilter).toBe("ch-1");
    expect(result.current.typeFilter).toBe("flash");
  });

  it("coerces invalid cached typeFilter to all", () => {
    storage.set(`passive-reader-filters:${CAT_ID}`, {
      subFilter: "all",
      chapterFilter: "all",
      typeFilter: "invalid",
    });

    const { result } = renderHook(() =>
      usePassiveReaderFilters(CAT_ID, makeSubcategories()),
    );

    expect(result.current.typeFilter).toBe("all");
  });

  it("persists filter changes", () => {
    const { result } = renderHook(() =>
      usePassiveReaderFilters(CAT_ID, makeSubcategories()),
    );

    act(() => {
      result.current.setSubFilter("sub-1");
      result.current.setChapterFilter("ch-2");
      result.current.setTypeFilter("essay");
    });

    expect(storage.get(`passive-reader-filters:${CAT_ID}`)).toEqual({
      subFilter: "sub-1",
      chapterFilter: "ch-2",
      typeFilter: "essay",
    });
  });

  it("resetAll clears every filter", () => {
    storage.set(`passive-reader-filters:${CAT_ID}`, {
      subFilter: "sub-1",
      chapterFilter: "ch-1",
      typeFilter: "flash",
    });

    const { result } = renderHook(() =>
      usePassiveReaderFilters(CAT_ID, makeSubcategories()),
    );

    act(() => result.current.resetAll());

    expect(result.current.subFilter).toBe("all");
    expect(result.current.chapterFilter).toBe("all");
    expect(result.current.typeFilter).toBe("all");
  });

  it("drops stale subcategory id when taxonomy changes", async () => {
    storage.set(`passive-reader-filters:${CAT_ID}`, {
      subFilter: "sub-gone",
      chapterFilter: "ch-1",
      typeFilter: "all",
    });

    const { result } = renderHook(() =>
      usePassiveReaderFilters(CAT_ID, makeSubcategories()),
    );

    await waitFor(() => {
      expect(result.current.subFilter).toBe("all");
      expect(result.current.chapterFilter).toBe("all");
    });
  });

  it("drops stale chapter id when chapter is removed", async () => {
    storage.set(`passive-reader-filters:${CAT_ID}`, {
      subFilter: "sub-1",
      chapterFilter: "ch-gone",
      typeFilter: "all",
    });

    const { result } = renderHook(() =>
      usePassiveReaderFilters(CAT_ID, makeSubcategories()),
    );

    await waitFor(() => {
      expect(result.current.subFilter).toBe("sub-1");
      expect(result.current.chapterFilter).toBe("all");
    });
  });
});

describe("usePassiveReaderNavigation", () => {
  const cardA = makeCard({ id: "card-a", question: "A", createdAt: 1 });
  const cardB = makeCard({ id: "card-b", question: "B", createdAt: 2 });
  const cardC = makeCard({ id: "card-c", question: "C", createdAt: 3 });
  const allCards = [cardA, cardB, cardC];

  it("next and prev move within bounds", () => {
    const { result } = renderHook(() =>
      usePassiveReaderNavigation({
        cards: allCards,
        filtered: allCards,
        filters: makeFilters(),
      }),
    );

    expect(result.current.index).toBe(0);

    act(() => result.current.next());
    expect(result.current.index).toBe(1);

    act(() => result.current.next());
    expect(result.current.index).toBe(2);

    act(() => result.current.next());
    expect(result.current.index).toBe(2);

    act(() => result.current.prev());
    expect(result.current.index).toBe(1);

    act(() => result.current.prev());
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
  });

  it("arrow keys navigate the filtered list", () => {
    const { result } = renderHook(() =>
      usePassiveReaderNavigation({
        cards: allCards,
        filtered: allCards,
        filters: makeFilters(),
      }),
    );

    fireArrow("ArrowRight");
    expect(result.current.index).toBe(1);

    fireArrow("ArrowRight");
    expect(result.current.index).toBe(2);

    fireArrow("ArrowLeft");
    expect(result.current.index).toBe(1);
  });

  it("resets index when filters change", () => {
    const filters = makeFilters();
    const { result, rerender } = renderHook(
      (props: { filters: PassiveReaderFiltersAPI }) =>
        usePassiveReaderNavigation({
          cards: allCards,
          filtered: allCards,
          filters: props.filters,
        }),
      { initialProps: { filters } },
    );

    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.index).toBe(2);

    rerender({ filters: makeFilters({ subFilter: "sub-1" }) });
    expect(result.current.index).toBe(0);
  });

  it("clamps index when the filtered list shrinks", () => {
    const { result, rerender } = renderHook(
      (props: { filtered: typeof allCards }) =>
        usePassiveReaderNavigation({
          cards: allCards,
          filtered: props.filtered,
          filters: makeFilters(),
        }),
      { initialProps: { filtered: allCards } },
    );

    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.index).toBe(2);

    rerender({ filtered: [cardA] });
    expect(result.current.index).toBe(0);
  });

  it("jumps to initialCardId and consumes the request", async () => {
    const onConsumed = vi.fn();

    const { result } = renderHook(() =>
      usePassiveReaderNavigation({
        cards: allCards,
        filtered: allCards,
        filters: makeFilters(),
        initialCardId: "card-b",
        onInitialConsumed: onConsumed,
      }),
    );

    await waitFor(() => {
      expect(result.current.index).toBe(1);
    });
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("consumes initialCardId when the card does not exist", async () => {
    const onConsumed = vi.fn();

    renderHook(() =>
      usePassiveReaderNavigation({
        cards: allCards,
        filtered: allCards,
        filters: makeFilters(),
        initialCardId: "card-missing",
        onInitialConsumed: onConsumed,
      }),
    );

    await waitFor(() => {
      expect(onConsumed).toHaveBeenCalledTimes(1);
    });
  });

  it("calls resetAll then jumps once filters expose the card", async () => {
    const onConsumed = vi.fn();
    const resetAll = vi.fn();

    const { result, rerender } = renderHook(
      (props: {
        filtered: typeof allCards;
        filters: PassiveReaderFiltersAPI;
      }) =>
        usePassiveReaderNavigation({
          cards: allCards,
          filtered: props.filtered,
          filters: props.filters,
          initialCardId: "card-a",
          onInitialConsumed: onConsumed,
        }),
      {
        initialProps: {
          filtered: [cardB, cardC],
          filters: makeFilters({ subFilter: "sub-1", resetAll }),
        },
      },
    );

    await waitFor(() => {
      expect(resetAll).toHaveBeenCalledTimes(1);
    });
    expect(onConsumed).not.toHaveBeenCalled();

    rerender({
      filtered: allCards,
      filters: makeFilters({ resetAll }),
    });

    await waitFor(() => {
      expect(result.current.index).toBe(0);
      expect(onConsumed).toHaveBeenCalledTimes(1);
    });
  });
});
