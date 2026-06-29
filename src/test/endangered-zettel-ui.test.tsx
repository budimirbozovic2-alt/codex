/**
 * TD-ZK-3 — endangered concept signal reaches the Zettelkasten.
 *  - buildEndangeredArticleIds (pure derivation)
 *  - ZettelExplorerPanel warning indicator
 *  - BacklinksPanel endangered highlight
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Card } from "@/lib/spaced-repetition";
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { buildEndangeredArticleIds } from "@/lib/saga/endangered-articles";

const emptyDoc = { version: 4 as const, content: { type: "doc", content: [] } };

function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id,
    question: `Q-${id}`,
    sections: [],
    categoryId: "cat",
    createdAt: 1,
    type: "essay",
    readCount: 0,
    ...over,
  } as Card;
}

function article(id: string, title: string): KnowledgeBaseArticle {
  return {
    id,
    subjectId: "cat",
    title,
    contentDoc: emptyDoc,
    linkedSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  } as KnowledgeBaseArticle;
}

describe("buildEndangeredArticleIds", () => {
  it("collects article ids with an endangered linked card", () => {
    const ids = buildEndangeredArticleIds([
      card("c1", { isEndangered: true, linkedArticleId: "art-1" }),
      card("c2", { isEndangered: false, linkedArticleId: "art-2" }),
      card("c3", { isEndangered: true }), // endangered but unlinked
      card("c4", { isEndangered: true, linkedArticleId: "art-1" }), // dup
    ]);
    expect([...ids]).toEqual(["art-1"]);
  });

  it("returns an empty set when nothing is endangered", () => {
    expect(buildEndangeredArticleIds([card("c1", { linkedArticleId: "a" })]).size).toBe(0);
  });
});

describe("ZettelExplorerPanel — endangered indicator", () => {
  it("flags an article whose linked card is endangered, not a healthy one", async () => {
    const { default: ZettelExplorerPanel } = await import(
      "@/components/zettelkasten/ZettelExplorerPanel"
    );
    render(
      <ZettelExplorerPanel
        subjectId="cat"
        articles={[article("art-1", "Ugrožen pojam"), article("art-2", "Zdrav pojam")]}
        activeId={null}
        collapsed={false}
        onToggleCollapsed={() => {}}
        onOpen={() => {}}
        onCreate={() => {}}
        endangeredArticleIds={new Set(["art-1"])}
      />,
    );

    const warnings = screen.getAllByLabelText("Ugrožen koncept / Sadrži bube");
    expect(warnings).toHaveLength(1);
    // The warning sits in the same row as the endangered article.
    expect(screen.getByText("Ugrožen pojam")).toBeInTheDocument();
    expect(screen.getByText("Zdrav pojam")).toBeInTheDocument();
  });
});

vi.mock("@/lib/backlink-index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backlink-index")>();
  return {
    ...actual,
    useBacklinks: () => [
      { articleId: "art-1", title: "Ugrožen izvor", snippet: "…" },
      { articleId: "art-9", title: "Zdrav izvor", snippet: "…" },
    ],
  };
});

describe("BacklinksPanel — endangered highlight", () => {
  it("highlights a backlink pointing to an endangered article", async () => {
    const { default: BacklinksPanel } = await import(
      "@/components/zettelkasten/BacklinksPanel"
    );
    render(
      <BacklinksPanel
        subjectId="cat"
        activeArticleId="art-active"
        activeTitle="Aktivni"
        onOpen={() => {}}
        endangeredArticleIds={new Set(["art-1"])}
      />,
    );

    const endangered = screen.getByTitle("Ovaj dio tvoje mreže znanja slabi");
    expect(endangered).toBeInTheDocument();
    expect(endangered.textContent).toContain("Ugrožen izvor");
    // Healthy backlink has no endangered tooltip.
    expect(screen.getByText("Zdrav izvor")).toBeInTheDocument();
  });
});
