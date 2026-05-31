/**
 * PR-F — Per-category card counts come from SQL, not from a reducer over
 * `useAllCards()`. This test pins the contract:
 *
 *   1. `useCardCountByCategory(id)` calls `cardCountByCategory(id)` (SQL
 *      SELECT COUNT(*) ... WHERE categoryId = ?).
 *   2. `useCardCountsByCategoryMap(ids)` returns a stable map keyed by id.
 *   3. `notifyCardsChanged()` invalidates the count cache via the bridge.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  _resetBridgesForTest,
  installQueryBridges,
} from "@/lib/query/bridges";

const countsByCat: Record<string, number> = { "cat-a": 3, "cat-b": 7 };
const countByCategoryMock = vi.fn(async (id: string) => countsByCat[id] ?? 0);

vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return {
    ...actual,
    cardCountByCategory: (id: string) => countByCategoryMock(id),
    listAllCards: vi.fn(async () => []),
    cardsByCategory: vi.fn(async () => []),
    cardsBySubcategory: vi.fn(async () => []),
    cardsByChapter: vi.fn(async () => []),
    cardsBySource: vi.fn(async () => []),
    getCardsByIds: vi.fn(async () => []),
  };
});

const { useCardCountByCategory, useCardCountsByCategoryMap } = await import(
  "@/hooks/card/useCardsQuery"
);
const { notifyCardsChanged } = await import("@/lib/db/queries");

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function makeQc(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 5 * 60_000 } },
  });
}

beforeEach(() => {
  _resetBridgesForTest();
  countByCategoryMock.mockClear();
  countsByCat["cat-a"] = 3;
  countsByCat["cat-b"] = 7;
});

afterEach(() => {
  _resetBridgesForTest();
});

describe("useCardCountByCategory — SQL count", () => {
  it("returns SQL count and refetches on notifyCardsChanged", async () => {
    const qc = makeQc();
    installQueryBridges(qc);

    const { result } = renderHook(() => useCardCountByCategory("cat-a"), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => expect(result.current).toBe(3));
    expect(countByCategoryMock).toHaveBeenCalledWith("cat-a");

    // Mutate the SQL-side value and emit the bridge signal.
    countsByCat["cat-a"] = 11;
    act(() => { notifyCardsChanged(); });

    await waitFor(() => expect(result.current).toBe(11), { timeout: 2000 });
  });
});

describe("useCardCountsByCategoryMap — batched counts", () => {
  it("returns a map keyed by categoryId", async () => {
    const qc = makeQc();
    installQueryBridges(qc);

    const { result } = renderHook(
      () => useCardCountsByCategoryMap(["cat-a", "cat-b"]),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => {
      expect(result.current["cat-a"]).toBe(3);
      expect(result.current["cat-b"]).toBe(7);
    });
  });

  it("returns a stable map reference when counts do not change", async () => {
    const qc = makeQc();
    installQueryBridges(qc);

    const { result, rerender } = renderHook(
      () => useCardCountsByCategoryMap(["cat-a", "cat-b"]),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current["cat-a"]).toBe(3));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("refetches all entries on notifyCardsChanged", async () => {
    const qc = makeQc();
    installQueryBridges(qc);

    const { result } = renderHook(
      () => useCardCountsByCategoryMap(["cat-a", "cat-b"]),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current["cat-b"]).toBe(7));

    countsByCat["cat-a"] = 5;
    countsByCat["cat-b"] = 9;
    act(() => { notifyCardsChanged(); });

    await waitFor(() => {
      expect(result.current["cat-a"]).toBe(5);
      expect(result.current["cat-b"]).toBe(9);
    }, { timeout: 2000 });
  });
});
