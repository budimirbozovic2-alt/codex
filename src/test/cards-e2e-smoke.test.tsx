/**
 * PR-F+ — End-to-end smoke: create → mirror → rollback through the
 * `cardRepository.put` / `listAllCards` flow.
 *
 * Threads a single TanStack cache through three steps to prove the
 * production wiring (no UI):
 *
 *   1. CREATE      — `useCardMutations().save.mutateAsync(card)` runs the
 *                    optimistic `onMutate` patch on `['cards','all']`.
 *   2. MIRROR      — storage gains rows; `notifyCardsChanged()` direct-invalidates
 *                    the singleton queryClient and `useAllCards()` re-hydrates.
 *   3. ROLLBACK    — a second `save.mutateAsync` is attempted with
 *                    `cardRepository.put` rejecting; `onError` restores the
 *                    previous snapshot so the cache contains only the
 *                    mirrored row.
 *
 * Mocks only the storage seam (`@/lib/db/queries`); everything else
 * (mutations, query keys, optimistic patches) runs as in PROD.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import type { Card } from "@/lib/spaced-repetition";

// ── Storage-seam mocks ───────────────────────────────────────────────────
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

function makeCard(id: string, categoryId = "cat-smoke"): Card {
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

function wrapper() {
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

describe("E2E smoke — create → mirror → rollback via cardRepository/listAllCards", () => {
  it("threads a single cache through create, mirror, and rollback", async () => {
    const reader = renderHook(() => useAllCards(), { wrapper: wrapper() });
    const mutator = renderHook(() => useCardMutations(), { wrapper: wrapper() });

    // First hydration — empty.
    await waitFor(() => expect(reader.result.current).toEqual([]));

    // ─── STEP 1: CREATE ────────────────────────────────────────────────
    // cardRepository.put succeeds; test pretends storage now holds the row.
    cardPutMock.mockImplementation(async (card: Card) => {
      currentRows = [...currentRows, card];
      return card;
    });

    const created = makeCard("c1");

    await act(async () => {
      await mutator.result.current.save.mutateAsync(created);
    });

    // Optimistic patch already applied via onMutate — assert without
    // depending on the bridge's debounced invalidation.
    expect(cardPutMock).toHaveBeenCalledTimes(1);
    expect(cardPutMock).toHaveBeenCalledWith(created);
    await waitFor(() =>
      expect(reader.result.current.map((c) => c.id)).toEqual(["c1"]),
    );

    // ─── STEP 2: MIRROR ────────────────────────────────────────────────
    // Storage row appears that did NOT go through the mutation hook
    // (e.g. background migration, lazy heal). notifyCardsChanged() must
    // trigger a refetch from listAllCards so the reader picks it up.
    currentRows = [...currentRows, makeCard("c2"), makeCard("c3")];
    act(() => { notifyCardsChanged(); });

    await waitFor(
      () => expect(reader.result.current.map((c) => c.id).sort()).toEqual([
        "c1", "c2", "c3",
      ]),
      { timeout: 2000 },
    );

    // ─── STEP 3: ROLLBACK ──────────────────────────────────────────────
    // Snapshot the mirrored cache, then attempt a doomed write. The
    // optimistic patch must appear briefly, then be reverted on error.
    const mirrored = reader.result.current;
    cardPutMock.mockReset();
    cardPutMock.mockImplementation(async () => {
      throw new Error("disk full");
    });

    const doomed = makeCard("c4");
    await act(async () => {
      await mutator.result.current.save
        .mutateAsync(doomed)
        .catch(() => undefined);
    });

    await waitFor(() =>
      expect(mutator.result.current.save.isError).toBe(true),
    );

    // Cache restored to pre-write snapshot (no "c4").
    const after = queryClient.getQueryData<readonly Card[]>(queryKeys.cards.all()) ?? [];
    expect(after.map((c) => c.id).sort()).toEqual(["c1", "c2", "c3"]);
    expect(after.length).toBe(mirrored.length);
    expect(cardPutMock).toHaveBeenCalledTimes(1);
    expect(cardPutMock).toHaveBeenCalledWith(doomed);
  });
});
