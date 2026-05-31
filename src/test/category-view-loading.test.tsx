/**
 * Pilot: "No more empty blinks" — see .lovable/plan.md.
 *
 * We don't mount the full `CategoryView` (drags AppContext, react-router,
 * AppContext mutators). Instead we verify the building blocks:
 *
 *   1. `<ListSkeleton>` and `<SourcesTabSkeleton>` render the expected
 *      layout-shape placeholders (so the swap to real content has no
 *      layout shift).
 *   2. `useCardsByCategoryWithStatus` exposes `{ cards, isLoading,
 *      isFetching }` and flips `isLoading` from `true` → `false` once the
 *      query resolves — which is what gates the skeleton in CategoryView.
 *   3. `startViewTransition` is safe to call in jsdom (no `document.
 *      startViewTransition`) and still runs the callback synchronously.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

import {
  ListSkeleton,
  SourcesTabSkeleton,
  CategoryHeaderSkeleton,
} from "@/components/ui/list-skeleton";
import { startViewTransition } from "@/lib/ui/view-transition";

// ── 1. Skeleton primitives render the expected shape ─────────────────────
describe("CategoryView loading primitives", () => {
  it("ListSkeleton renders the requested number of row placeholders", () => {
    const { container } = render(<ListSkeleton rows={5} />);
    const skeleton = screen.getByTestId("list-skeleton");
    // Top-level container + 5 row wrappers.
    expect(skeleton.children.length).toBe(5);
    // Each row has 3 inner Skeleton blocks (avatar + 2 text lines + chip = 4
    // div children counting the text wrapper).
    expect(container.querySelectorAll(".bg-muted").length).toBeGreaterThanOrEqual(15);
  });

  it("SourcesTabSkeleton includes tab strip + list shell", () => {
    render(<SourcesTabSkeleton />);
    expect(screen.getByTestId("sources-tab-skeleton")).toBeTruthy();
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("CategoryHeaderSkeleton renders without error", () => {
    render(<CategoryHeaderSkeleton />);
    expect(screen.getByTestId("category-header-skeleton")).toBeTruthy();
  });
});

// ── 2. Status-aware cards hook exposes loading lifecycle ─────────────────
vi.mock("@/lib/db/queries", () => ({
  listAllCards: vi.fn(),
  cardsByCategory: vi.fn(),
  cardsBySubcategory: vi.fn(),
  cardsByChapter: vi.fn(),
  cardsBySource: vi.fn(),
  getCardsByIds: vi.fn(),
  cardCountByCategory: vi.fn(),
  notifyCardsChanged: vi.fn(),
  onCardsChanged: vi.fn(() => () => {}),
}));

import { cardsByCategory } from "@/lib/db/queries";
import { useCardsByCategoryWithStatus } from "@/hooks/card/useCardsQuery";

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useCardsByCategoryWithStatus", () => {
  it("flips isLoading from true to false once the query resolves", async () => {
    let resolveFn = null as ((rows: never[]) => void) | null;
    vi.mocked(cardsByCategory).mockImplementation(
      () =>
        new Promise<never[]>((resolve) => {
          resolveFn = resolve;
        }),
    );

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useCardsByCategoryWithStatus("cat-1"),
      { wrapper: wrapper(qc) },
    );

    // Initial state: loading, no data.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.cards.length).toBe(0);

    // Resolve.
    resolveFn?.([]);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("returns isLoading=false immediately when disabled (no categoryId)", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => useCardsByCategoryWithStatus(undefined),
      { wrapper: wrapper(qc) },
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.cards.length).toBe(0);
  });
});

// ── 3. View transition helper is jsdom-safe ──────────────────────────────
describe("startViewTransition", () => {
  it("runs the callback synchronously when startViewTransition is unsupported", () => {
    const cb = vi.fn();
    startViewTransition(cb);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("delegates to document.startViewTransition when present", () => {
    const docAny = document as unknown as {
      startViewTransition?: (cb: () => void) => void;
    };
    const original = docAny.startViewTransition;
    const spy = vi.fn((cb: () => void) => cb());
    docAny.startViewTransition = spy;
    try {
      const cb = vi.fn();
      startViewTransition(cb);
      expect(spy).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledOnce();
    } finally {
      docAny.startViewTransition = original;
    }
  });

  it("falls back to the callback when startViewTransition throws", () => {
    const docAny = document as unknown as {
      startViewTransition?: (cb: () => void) => void;
    };
    const original = docAny.startViewTransition;
    docAny.startViewTransition = vi.fn(() => {
      throw new Error("boom");
    });
    try {
      const cb = vi.fn();
      startViewTransition(cb);
      expect(cb).toHaveBeenCalledOnce();
    } finally {
      docAny.startViewTransition = original;
    }
  });
});
