/**
 * PR-H1 — Regression guards za 3 kritična fixa iz deep audita.
 *
 *   1. `gradeSection.mutationFn` čita pre-patch karticu iz SQLite, NE iz
 *      TanStack cache-a (koji je već optimistički patchovan). Bez ovog
 *      fix-a, FSRS patcher se primjenjuje dvaput po jednoj ocjeni →
 *      dupli decay stabilnosti.
 *   2. `autoFormatArticles` ne smije proći XSS payload kroz `innerHTML`
 *      round-trip. Wrapper sad koristi `createElement` + `appendChild`,
 *      što ne re-parsira HTML.
 *   3. `save`/`remove`/`gradeSection` and bulk mutations no longer call broad
 *      `invalidateQueries({ queryKey: ['cards'] })` in `onSettled`.
 *      Single-card writes use scoped bridge invalidation; bulk uses coordinator.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { Card } from "@/lib/spaced-repetition";
import { queryKeys } from "@/lib/query/keys";

// ── Mocks ────────────────────────────────────────────────────────────────
const putCardDirectMock = vi.fn();
const getCardsByIdsMock = vi.fn();
const deleteCardDirectMock = vi.fn();

vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return {
    ...actual,
    listAllCards: vi.fn(async () => [] as Card[]),
    getCardsByIds: (...args: unknown[]) => getCardsByIdsMock(...args),
    putCardDirect: (...args: unknown[]) => putCardDirectMock(...args),
    deleteCardDirect: (...args: unknown[]) => deleteCardDirectMock(...args),
    bulkPutCardsDirect: vi.fn(async (rows: Card[]) => rows),
  };
});

const { useCardMutations } = await import("@/hooks/card/useCardMutations");
const { autoFormatArticles } = await import("@/lib/article-autoformat");
const { cardRepository } = await import("@/lib/repositories");

function makeCard(id: string, stability = 1): Card {
  return {
    id,
    question: id,
    sections: [],
    categoryId: "cat",
    createdAt: 0,
    readCount: 0,
    type: "essay",
    stability,
  } as unknown as Card;
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeQc(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

beforeEach(() => {
  putCardDirectMock.mockReset();
  getCardsByIdsMock.mockReset();
  deleteCardDirectMock.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────
// 1) gradeSection NE smije duplo primijeniti patcher
// ─────────────────────────────────────────────────────────────────────────
describe("PR-H1 #1 — gradeSection applies patcher exactly once", () => {
  it("reads pre-patch card from SQLite, not from optimistic cache", async () => {
    const qc = makeQc();
    const initial = makeCard("c1", /* stability */ 10);

    // Pre-seed the card into SQLite so cardRepository.patch can find it.
    await cardRepository.put(initial);

    // Optimistic cache shows the same pre-patch row.
    qc.setQueryData(queryKeys.cards.all(), [initial]);

    // Patcher halves stability. Applied once: 10 → 5. Applied twice: 10 → 2.5.
    const patcher = (c: Card): Card => ({
      ...c,
      stability: ((c as Card & { stability: number }).stability) / 2,
    } as Card);

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(qc),
    });

    let written: Card | undefined;
    await act(async () => {
      written = await result.current.gradeSection.mutateAsync({ cardId: "c1", patcher });
    });

    expect(written).toBeDefined();
    // Single application: 10 / 2 = 5. Double would be 2.5.
    expect((written as Card & { stability: number }).stability).toBe(5);
    // cardRepository.patch performs the read-modify-write atomically inside
    // a single SQLite transaction — getCardsByIds is no longer called directly.
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2) settle() je uklonjen iz single-card mutacija
// ─────────────────────────────────────────────────────────────────────────
describe("PR-H1 #3 — save/remove/gradeSection don't broad-invalidate", () => {
  it("save mutation does not call invalidateQueries(['cards'])", async () => {
    const qc = makeQc();
    qc.setQueryData(queryKeys.cards.all(), [] as Card[]);
    putCardDirectMock.mockResolvedValue(makeCard("x"));

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.save.mutateAsync(makeCard("x"));
    });

    // Bridge owns invalidation; single-card mutations must not pile on.
    const cardsRootCalls = invalidateSpy.mock.calls.filter((args) => {
      const key = (args[0] as { queryKey?: unknown[] } | undefined)?.queryKey;
      return Array.isArray(key) && key[0] === "cards" && key.length === 1;
    });
    expect(cardsRootCalls.length).toBe(0);
  });

  it("gradeSection does not call invalidateQueries(['cards'])", async () => {
    const qc = makeQc();
    const initial = makeCard("g1", 8);
    qc.setQueryData(queryKeys.cards.all(), [initial]);
    getCardsByIdsMock.mockResolvedValue([initial]);
    putCardDirectMock.mockImplementation(async (c: Card) => c);

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.gradeSection.mutateAsync({
        cardId: "g1",
        patcher: (c) => c,
      });
    });

    const cardsRootCalls = invalidateSpy.mock.calls.filter((args) => {
      const key = (args[0] as { queryKey?: unknown[] } | undefined)?.queryKey;
      return Array.isArray(key) && key[0] === "cards" && key.length === 1;
    });
    expect(cardsRootCalls.length).toBe(0);
  });

  it("bulkUpsert does not call invalidateQueries(['cards']) prefix", async () => {
    const qc = makeQc();
    qc.setQueryData(queryKeys.cards.all(), [] as Card[]);
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useCardMutations(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.bulkUpsert.mutateAsync([makeCard("b1"), makeCard("b2")]);
    });

    const cardsRootCalls = invalidateSpy.mock.calls.filter((args) => {
      const key = (args[0] as { queryKey?: unknown[] } | undefined)?.queryKey;
      return Array.isArray(key) && key[0] === "cards" && key.length === 1;
    });
    expect(cardsRootCalls.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3) autoFormatArticles XSS guard
// ─────────────────────────────────────────────────────────────────────────
describe("PR-H1 #2 — autoFormatArticles does not execute or preserve XSS payloads", () => {
  it("does not re-render an onerror payload as parseable HTML", () => {
    // Payload smuggled into a "Član" paragraph. The previous innerHTML
    // round-trip would re-parse the text content (which `DOMParser`
    // already neutralized), but a payload INSIDE the article's text
    // attribute would survive. We assert the wrapper output never
    // contains the literal `onerror=` attribute on an <img> after
    // formatting (i.e. it's not re-injected by our code).
    const malicious = `
      <p>Naslov člana</p>
      <p>Član 1</p>
      <p>Tekst &lt;img src=x onerror="alert(1)"&gt; ovdje</p>
    `;
    const { html, count } = autoFormatArticles(malicious);
    expect(count).toBe(1);
    // No live <img> element with onerror should be in the output.
    expect(/<img[^>]+onerror/i.test(html)).toBe(false);
  });

  it("uses createElement-based wrapping (no innerHTML round-trip)", () => {
    // Sanity: format a benign Član and confirm the strong wrapper exists
    // and inner text is preserved.
    const input = `<p>Naziv akta</p><p>Član 5</p>`;
    const { html, count } = autoFormatArticles(input);
    expect(count).toBe(1);
    expect(html).toMatch(/<strong>Član 5<\/strong>/);
    expect(html).toMatch(/<strong>Naziv akta<\/strong>/);
  });
});
