/**
 * One-way mirror sync + mutation rollback contract.
 *
 * Mirror: writes commit to Zustand (`cardMapWrites`) which emits
 * `notifyCardsChanged`. The TanStack bridge (`installQueryBridges`) debounces
 * those notifications into `invalidateQueries(['cards'])`, which triggers
 * `useAllCards` to refetch from the read SSOT (`listAllCards`). Test #1
 * proves that the bridge actually delivers live data to the hook.
 *
 * Rollback: `useCardMutations.save.onMutate` snapshots every `['cards', …]`
 * query and `onError` restores them when the persist path throws. Test #2
 * proves the snapshot/restore covers MULTIPLE scoped keys, even when those
 * keys are mutated AFTER onMutate has already snapshotted.
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
// `listAllCards` is the read SSOT for `['cards','all']`. We control its
// return value to verify the bridge actually flows new data into the hook.
let currentRows: Card[] = [];
vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return {
    ...actual,
    listAllCards: vi.fn(async () => currentRows),
    getCardsByIds: vi.fn(async (ids: string[]) =>
      ids.map((id) => currentRows.find((c) => c.id === id) ?? null),
    ),
  };
});

// `cardMapWrites.put` is invoked synchronously inside the mutation's
// `putAsync` wrapper. Throwing here forces `wrapWrite` to return
// `{ ok: false }`, which surfaces as a rejected mutation and triggers
// `onError → rollback`.
const putMock = vi.fn();
vi.mock("@/lib/cards/cardMapWrites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cards/cardMapWrites")>();
  return {
    ...actual,
    put: (...args: unknown[]) => putMock(...args),
  };
});

// Imports AFTER mocks so the hooks pick up the mocked modules.
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
  // gcTime intentionally large: `setQueryData` with no active observer
  // would otherwise be evicted immediately and our snapshot/rollback
  // assertions would see `undefined`.
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 5 * 60_000 } },
  });
}

beforeEach(() => {
  _resetBridgesForTest();
  currentRows = [];
  putMock.mockReset();
});

afterEach(() => {
  _resetBridgesForTest();
});

// ─────────────────────────────────────────────────────────────────────────
// 1) Live mirror — bridge feeds fresh listAllCards() output to useAllCards
// ─────────────────────────────────────────────────────────────────────────
describe("useAllCards — one-way mirror via query bridge", () => {
  it("hydrates from listAllCards on first mount", async () => {
    const qc = makeQc();
    installQueryBridges(qc);
    currentRows = [makeCard("a"), makeCard("b")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.length).toBe(2));
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("re-renders with fresh rows after notifyCardsChanged → bridge invalidates ['cards']", async () => {
    const qc = makeQc();
    installQueryBridges(qc);
    currentRows = [makeCard("a")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.length).toBe(1));

    // Simulate a sync RAM write: source rows mutate, then notify fires.
    currentRows = [makeCard("a"), makeCard("b"), makeCard("c")];
    act(() => {
      notifyCardsChanged();
    });

    // Bridge debounces ~16ms then invalidates → useQuery refetches.
    await waitFor(() => expect(result.current.length).toBe(3), { timeout: 2000 });
    expect(result.current.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("does NOT push data without notifyCardsChanged (mirror is event-driven, not polled)", async () => {
    const qc = makeQc();
    installQueryBridges(qc);
    currentRows = [makeCard("a")];

    const { result } = renderHook(() => useAllCards(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.length).toBe(1));

    // Mutate the source WITHOUT firing notify. Hook must NOT see the change
    // (staleTime: Infinity + no invalidation → cached value held).
    currentRows = [makeCard("a"), makeCard("b")];
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2) Rollback — snapshot/restore on persist failure
// ─────────────────────────────────────────────────────────────────────────
describe("useCardMutations.save — rollback on persist failure", () => {
  it("restores every ['cards', …] snapshot when put throws mid-flight", async () => {
    // Bridge intentionally NOT installed: we don't want `reloadCardsFromDb`
    // (fired by the rollback path) to schedule a refetch that would clobber
    // the restored snapshot before we assert.
    const qc = makeQc();

    const initialAll = [makeCard("a"), makeCard("b")];
    const initialByCat = [makeCard("a", "cat-X")];
    qc.setQueryData(queryKeys.cards.all(), initialAll);
    qc.setQueryData(queryKeys.cards.byCategory("cat-X"), initialByCat);

    // `put` runs AFTER onMutate snapshots. We corrupt both cached keys here,
    // then throw. The onError handler must restore both back to `initial*`.
    putMock.mockImplementation(() => {
      qc.setQueryData(queryKeys.cards.all(), [
        ...initialAll,
        makeCard("PHANTOM"),
      ]);
      qc.setQueryData(queryKeys.cards.byCategory("cat-X"), [
        ...initialByCat,
        makeCard("PHANTOM", "cat-X"),
      ]);
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
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for the cache when put succeeds (no spurious snapshot overwrite)", async () => {
    const qc = makeQc();

    const initialAll = [makeCard("a")];
    qc.setQueryData(queryKeys.cards.all(), initialAll);

    // Success path: put returns void; bridge would normally invalidate via
    // notifyCardsChanged, but with no bridge installed the cache is
    // untouched — exactly what we want to assert here.
    putMock.mockImplementation(() => {
      /* commit succeeds */
    });

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.save.mutateAsync(makeCard("c"));
    });

    expect(result.current.save.isSuccess).toBe(true);
    // Cache unchanged — no rollback fired, no optimistic patch wired.
    expect(qc.getQueryData(queryKeys.cards.all())).toEqual(initialAll);
  });
});
