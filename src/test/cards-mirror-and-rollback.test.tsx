/**
 * PR-E5 — Cards mutations: TanStack-only mirror + rollback contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { flushMacrotasks } from "./helpers/timers";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import type { Card } from "@/lib/spaced-repetition";

let currentRows: Card[] = [];
const cardPutMock = vi.fn();

vi.mock("@/lib/repositories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories")>();
  return {
    ...actual,
    cardRepository: {
      ...(actual.cardRepository as object),
      put: (...args: unknown[]) => cardPutMock(...args),
    },
  };
});

vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return {
    ...actual,
    listAllCards: vi.fn(async () => currentRows),
    cardsByCategory: vi.fn(async (id: string) =>
      currentRows.filter((c) => c.categoryId === id),
    ),
    getCardsByIds: vi.fn(async (ids: string[]) =>
      ids.map((id) => currentRows.find((c) => c.id === id) ?? null),
    ),
    cardCountByCategory: vi.fn(async (id: string) =>
      currentRows.filter((c) => c.categoryId === id).length,
    ),
  };
});

const { useAllCards } = await import("@/hooks/card/useCardsQuery");
const { useCardMutations } = await import("@/hooks/card/useCardMutations");
const { notifyCardsChanged } = await import("@/lib/db/queries");

function makeCard(id: string, categoryId = "cat-default"): Card {
  return {
    id,
    question: id,
    sections: [],
    categoryId,
    createdAt: 0,
    readCount: 0,
    type: "essay",
  } as unknown as Card;
}

function makeWrapper() {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient.clear();
  currentRows = [];
  cardPutMock.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

describe("useAllCards — mirror via direct invalidation", () => {
  it("hydrates from listAllCards on first mount", async () => {
    currentRows = [makeCard("a"), makeCard("b")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.length).toBe(2));
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("re-renders with fresh rows after notifyCardsChanged", async () => {
    currentRows = [makeCard("a")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.length).toBe(1));

    currentRows = [makeCard("a"), makeCard("b"), makeCard("c")];
    act(() => { notifyCardsChanged(); });

    await waitFor(() => expect(result.current.length).toBe(3), { timeout: 2000 });
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("does NOT push data without notifyCardsChanged (event-driven, not polled)", async () => {
    currentRows = [makeCard("a")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.length).toBe(1));

    currentRows = [makeCard("a"), makeCard("b")];
    await flushMacrotasks(5);
    expect(result.current.length).toBe(1);
  });
});

describe("useCardMutations.save — rollback on persist failure", () => {
  it("restores every ['cards', …] snapshot when cardRepository.put throws", async () => {
    const initialAll = [makeCard("a"), makeCard("b")];
    const initialByCat = [makeCard("a", "cat-X")];
    queryClient.setQueryData(queryKeys.cards.all(), initialAll);
    queryClient.setQueryData(queryKeys.cards.byCategory("cat-X"), initialByCat);

    cardPutMock.mockRejectedValue(new Error("disk full"));

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.save
        .mutateAsync(makeCard("c", "cat-X"))
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.save.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.cards.all())).toEqual(initialAll);
    expect(queryClient.getQueryData(queryKeys.cards.byCategory("cat-X"))).toEqual(initialByCat);
    expect(cardPutMock).toHaveBeenCalledTimes(1);
  });

  it("optimistically patches ['cards','all'] before the write resolves", async () => {
    const initialAll = [makeCard("a")];
    queryClient.setQueryData(queryKeys.cards.all(), initialAll);

    let resolveWrite: (v: Card) => void = () => {};
    cardPutMock.mockImplementation(
      (card: Card) => new Promise<Card>((res) => { resolveWrite = () => res(card); }),
    );

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(),
    });

    const newCard = makeCard("c");
    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.save.mutateAsync(newCard).catch(() => undefined);
    });

    await waitFor(() => {
      const cache = queryClient.getQueryData<readonly Card[]>(queryKeys.cards.all());
      expect(cache?.map((c) => c.id).sort()).toEqual(["a", "c"]);
    });

    await act(async () => {
      resolveWrite(newCard);
      await pending;
    });
  });
});
