/**
 * TD-ZK-1 Phase D — card ↔ article concept link UI.
 *  - useCardsByArticle derives linked cards from the category cache
 *  - LinkCardsToArticleDialog: multi-select + confirm
 *  - LinkedCardsPanel: list, open, unlink
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "@/lib/query/client";
import type { Card } from "@/lib/spaced-repetition";

const cards: Card[] = [
  { id: "c1", question: "Pojam krivičnog djela", sections: [], categoryId: "cat", createdAt: 1, type: "flash", readCount: 0, linkedArticleId: "art-1" } as Card,
  { id: "c2", question: "Elementi bića", sections: [], categoryId: "cat", createdAt: 2, type: "essay", readCount: 0, linkedArticleId: "art-1" } as Card,
  { id: "c3", question: "Nepovezana kartica", sections: [], categoryId: "cat", createdAt: 3, type: "flash", readCount: 0 } as Card,
];

vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return {
    ...actual,
    cardsByCategory: vi.fn(async () => cards),
    listAllCards: vi.fn(async () => cards),
    getCardsByIds: vi.fn(async () => []),
  };
});

const { useCardsByArticle } = await import("@/hooks/card/useCardsQuery");
const { LinkCardsToArticleDialog } = await import(
  "@/components/zettelkasten/LinkCardsToArticleDialog"
);
const { LinkedCardsPanel } = await import(
  "@/components/zettelkasten/LinkedCardsPanel"
);

function wrapper() {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => queryClient.clear());
afterEach(() => queryClient.clear());

describe("useCardsByArticle", () => {
  it("returns only cards linked to the given article", async () => {
    const { result } = renderHook(() => useCardsByArticle("cat", "art-1"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("returns empty when no articleId", async () => {
    const { result } = renderHook(() => useCardsByArticle("cat", undefined), {
      wrapper: wrapper(),
    });
    expect(result.current).toHaveLength(0);
  });
});

describe("LinkCardsToArticleDialog", () => {
  it("confirms with the selected card ids", async () => {
    const onLink = vi.fn();
    render(
      <LinkCardsToArticleDialog
        open
        onOpenChange={() => {}}
        articleTitle="Pojam"
        candidates={[cards[2]]}
        onLink={onLink}
      />,
    );

    // Confirm disabled until something is selected.
    expect(screen.getByText(/Poveži \(0\)/)).toBeDisabled();

    fireEvent.click(screen.getByText("Nepovezana kartica"));
    fireEvent.click(screen.getByText(/Poveži \(1\)/));

    await waitFor(() => expect(onLink).toHaveBeenCalledWith(["c3"]));
  });
});

describe("LinkedCardsPanel", () => {
  it("lists linked cards and fires open/unlink callbacks", async () => {
    const onOpenCard = vi.fn();
    const onUnlink = vi.fn();
    render(
      <LinkedCardsPanel
        subjectId="cat"
        articleId="art-1"
        articleTitle="Pojam"
        onOpenCard={onOpenCard}
        onLink={() => {}}
        onUnlink={onUnlink}
      />,
      { wrapper: wrapper() },
    );

    await waitFor(() =>
      expect(screen.getByText("Pojam krivičnog djela")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Pojam krivičnog djela"));
    expect(onOpenCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" }),
    );

    fireEvent.click(screen.getAllByTitle("Ukloni vezu")[0]);
    expect(onUnlink).toHaveBeenCalledWith("c1");
  });

  it("shows an empty state when no cards are linked", async () => {
    render(
      <LinkedCardsPanel
        subjectId="cat"
        articleId="art-none"
        articleTitle="Prazno"
        onOpenCard={() => {}}
        onLink={() => {}}
        onUnlink={() => {}}
      />,
      { wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Nijedna kartica još nije povezana/),
      ).toBeInTheDocument(),
    );
  });
});
