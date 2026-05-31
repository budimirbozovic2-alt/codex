/**
 * PR-E5 — Cards mutations: TanStack-only mirror + rollback contract.
 *
 * Post PR-E2/E4 there is no Zustand `cardMapStore` and no `cardMapWrites`
 * sync RAM API. Writes go through `useCardMutations` → `*Direct` helpers in
 * `@/lib/db/queries`, which schedule via `persistQueue` and emit
 * `notifyCardsChanged`. The query bridge invalidates `['cards', ...]`,
 * which causes `useAllCards` to refetch from `listAllCards`.
 *
 * Mirror test: `notifyCardsChanged` → bridge invalidate → fresh rows hit
 *   `useAllCards` consumers.
 * Rollback test: when the direct write helper rejects, `onMutate` snapshots
 *   every `['cards', …]` key and `onError` restores them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  _resetBridgesForTest,
  installQueryBridges,
} from "@/lib/query/bridges";
import { queryKeys } from "@/lib/query/keys";
import type { Card } from "@/lib/spaced-repetition";

// ── Mocks ────────────────────────────────────────────────────────────────
// `listAllCards` feeds `['cards','all']`; we control its rows directly.
// `putCardDirect` is the write seam invoked by `useCardMutations.save` —
// throwing here triggers `onError → rollback`.
let currentRows: Card[] = [];
const putCardDirectMock = vi.fn();

vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return {
    ...actual,
    listAllCards: vi.fn(async () => currentRows),
    getCardsByIds: vi.fn(async (ids: string[]) =>
      ids.map((id) => currentRows.find((c) => c.id === id) ?? null),
    ),
    putCardDirect: (...args: unknown[]) => putCardDirectMock(...args),
  };
});

const { useAllCards } = await import("@/hooks/card/useCardsQuery");
const { useCardMutations } = await import("@/hooks/card/useCardMutations");
const { notifyCardsChanged } = await import("@/lib/db/queries");

function makeCard(id: string, categoryId = "cat"): Card {
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

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeQc(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 5 * 60_000 } },
  });
}

beforeEach(() => {
  _resetBridgesForTest();
  currentRows = [];
  putCardDirectMock.mockReset();
});

afterEach(() => {
  _resetBridgesForTest();
});

// ─────────────────────────────────────────────────────────────────────────
// 1) Live mirror — bridge feeds fresh listAllCards() to useAllCards
// ─────────────────────────────────────────────────────────────────────────
describe("useAllCards — mirror via query bridge", () => {
  it("hydrates from listAllCards on first mount", async () => {
    const qc = makeQc();
    installQueryBridges(qc);
    currentRows = [makeCard("a"), makeCard("b")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.length).toBe(2));
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("re-renders with fresh rows after notifyCardsChanged", async () => {
    const qc = makeQc();
    installQueryBridges(qc);
    currentRows = [makeCard("a")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.length).toBe(1));

    currentRows = [makeCard("a"), makeCard("b"), makeCard("c")];
    act(() => { notifyCardsChanged(); });

    await waitFor(() => expect(result.current.length).toBe(3), { timeout: 2000 });
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("does NOT push data without notifyCardsChanged (event-driven, not polled)", async () => {
    const qc = makeQc();
    installQueryBridges(qc);
    currentRows = [makeCard("a")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.length).toBe(1));

    currentRows = [makeCard("a"), makeCard("b")];
    // Yield several microtask/macrotask cycles instead of a wall-clock sleep.
    // Without an explicit notifyCardsChanged, no refetch should ever occur.
    // PR-G8: shared flushMacrotasks helper (RC-8).
    await flushMacrotasks(5);
    expect(result.current.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2) Rollback — snapshot/restore on persist failure
// ─────────────────────────────────────────────────────────────────────────
describe("useCardMutations.save — rollback on persist failure", () => {
  it("restores every ['cards', …] snapshot when putCardDirect throws", async () => {
    // Bridge intentionally NOT installed: avoid a settle-driven invalidation
    // refetching from the mocked `listAllCards` and clobbering the restored
    // snapshot before assertions run.
    const qc = makeQc();

    const initialAll = [makeCard("a"), makeCard("b")];
    const initialByCat = [makeCard("a", "cat-X")];
    qc.setQueryData(queryKeys.cards.all(), initialAll);
    qc.setQueryData(queryKeys.cards.byCategory("cat-X"), initialByCat);

    putCardDirectMock.mockImplementation(async () => {
      throw new Error("disk full");
    });

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.save
        .mutateAsync(makeCard("c", "cat-X"))
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.save.isError).toBe(true));
    expect(qc.getQueryData(queryKeys.cards.all())).toEqual(initialAll);
    expect(qc.getQueryData(queryKeys.cards.byCategory("cat-X"))).toEqual(initialByCat);
    expect(putCardDirectMock).toHaveBeenCalledTimes(1);
  });

  it("optimistically patches ['cards','all'] before the write resolves", async () => {
    const qc = makeQc();
    const initialAll = [makeCard("a")];
    qc.setQueryData(queryKeys.cards.all(), initialAll);

    let resolveWrite: (v: Card) => void = () => {};
    putCardDirectMock.mockImplementation(
      (card: Card) => new Promise<Card>((res) => { resolveWrite = () => res(card); }),
    );

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(qc),
    });

    const newCard = makeCard("c");
    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.save.mutateAsync(newCard).catch(() => undefined);
    });

    await waitFor(() => {
      const cache = qc.getQueryData<readonly Card[]>(queryKeys.cards.all());
      expect(cache?.map((c) => c.id).sort()).toEqual(["a", "c"]);
    });

    await act(async () => {
      resolveWrite(newCard);
      await pending;
    });
  });
});

