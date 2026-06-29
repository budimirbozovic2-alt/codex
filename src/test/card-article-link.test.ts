// TD-ZK-1 — card ↔ Zettelkasten article concept link.
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Card } from "@/lib/spaced-repetition";
import { cardRepository } from "@/lib/repositories";
import {
  listAllCards,
  listCardsByArticle,
  countCardsByArticle,
} from "@/lib/db/queries";
import { putArticle, deleteArticle } from "@/lib/db/queries/knowledge-base";
import { kbArticleFromMarkdown } from "@/test/helpers/kb-article-fixture";

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    question: `Q-${id}`,
    sections: [],
    categoryId: "cat-zk",
    createdAt: 1_000_000,
    type: "flash",
    ...overrides,
  } as Card;
}

describe("card ↔ article concept link (TD-ZK-1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips linkedArticleId through the column + payload", async () => {
    await cardRepository.put(makeCard("zk-rt", { linkedArticleId: "art-1" }));
    const all = await listAllCards();
    const card = all.find((c) => c.id === "zk-rt");
    expect(card?.linkedArticleId).toBe("art-1");
  });

  it("linkCardToArticle attaches and listCardsByArticle finds it", async () => {
    await cardRepository.put(makeCard("zk-link"));
    await cardRepository.linkCardToArticle("zk-link", "art-2");

    const linked = await listCardsByArticle("art-2");
    expect(linked.map((c) => c.id)).toContain("zk-link");
    expect(await countCardsByArticle("art-2")).toBe(1);
  });

  it("linkCardToArticle(undefined) detaches the link", async () => {
    await cardRepository.put(makeCard("zk-unlink", { linkedArticleId: "art-3" }));
    await cardRepository.linkCardToArticle("zk-unlink", undefined);

    expect(await countCardsByArticle("art-3")).toBe(0);
    const all = await listAllCards();
    expect(all.find((c) => c.id === "zk-unlink")?.linkedArticleId).toBeUndefined();
  });

  it("linkCardsToArticle bulk-attaches multiple cards", async () => {
    await cardRepository.put(makeCard("zk-b1"));
    await cardRepository.put(makeCard("zk-b2"));
    await cardRepository.linkCardsToArticle(["zk-b1", "zk-b2"], "art-bulk");

    expect(await countCardsByArticle("art-bulk")).toBe(2);
  });

  it("deleteArticle detaches linked cards (no dangling links)", async () => {
    const article = kbArticleFromMarkdown("cat-zk", "Pojam", "", { id: "art-del" });
    await putArticle(article);
    await cardRepository.put(makeCard("zk-detach", { linkedArticleId: "art-del" }));
    expect(await countCardsByArticle("art-del")).toBe(1);

    await deleteArticle("art-del");

    expect(await countCardsByArticle("art-del")).toBe(0);
    const all = await listAllCards();
    expect(all.find((c) => c.id === "zk-detach")?.linkedArticleId).toBeUndefined();
  });
});
