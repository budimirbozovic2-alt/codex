/**
 * Regression: EditPage must not redirect to dashboard while the by-id
 * query is still loading or refetching after cache invalidation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { Card } from "@/lib/spaced-repetition";
import { queryKeys } from "@/lib/query/keys";

const getCardsByIdsMock = vi.fn();

vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return {
    ...actual,
    getCardsByIds: (...args: unknown[]) => getCardsByIdsMock(...args),
  };
});

const { useCardByIdWithStatus } = await import("@/hooks/card/useCardsQuery");

function makeCard(id: string): Card {
  return {
    id,
    question: `Q ${id}`,
    sections: [],
    categoryId: "cat-1",
    createdAt: 0,
    readCount: 0,
    type: "essay",
  } as unknown as Card;
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: qc },
      createElement(MemoryRouter, null, children),
    );
  };
}

beforeEach(() => {
  getCardsByIdsMock.mockReset();
  getCardsByIdsMock.mockResolvedValue([]);
});

describe("useCardByIdWithStatus", () => {
  it("seeds from category cache immediately instead of reporting missing card", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const card = makeCard("card-1");
    qc.setQueryData(queryKeys.cards.byCategory("cat-1"), [card]);
    getCardsByIdsMock.mockResolvedValue([card]);

    const { result } = renderHook(() => useCardByIdWithStatus("card-1"), {
      wrapper: makeWrapper(qc),
    });

    expect(result.current.card?.id).toBe("card-1");
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps previous card visible during refetch after invalidation", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const card = makeCard("card-1");
    qc.setQueryData(queryKeys.cards.byId("card-1"), card);

    const { result } = renderHook(() => useCardByIdWithStatus("card-1"), {
      wrapper: makeWrapper(qc),
    });

    expect(result.current.card?.id).toBe("card-1");

    getCardsByIdsMock.mockImplementation(() => new Promise(() => {}));

    act(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.cards.byId("card-1") });
    });

    expect(result.current.card?.id).toBe("card-1");
    expect(result.current.isLoading).toBe(false);
  });
});
