import { describe, it, expect } from "vitest";
import type { Card } from "@/lib/spaced-repetition";
import {
  cardToScopeRef,
  scopesForRefs,
  uniqueCategoryScopes,
} from "@/lib/db/queries/cards-notify-scope";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    question: "Q",
    sections: [],
    categoryId: "cat-a",
    createdAt: 1,
    type: "essay",
    ...overrides,
  } as Card;
}

describe("cards-notify-scope", () => {
  it("derives category scope from card ref", () => {
    expect(uniqueCategoryScopes([cardToScopeRef(makeCard())])).toEqual([
      { kind: "category", categoryId: "cat-a" },
    ]);
  });

  it("dedupes multiple cards in the same category", () => {
    const scopes = uniqueCategoryScopes([
      cardToScopeRef(makeCard({ id: "1" })),
      cardToScopeRef(makeCard({ id: "2", categoryId: "cat-a" })),
    ]);
    expect(scopes).toHaveLength(1);
  });

  it("includes source scope when sourceId is set", () => {
    const scopes = scopesForRefs([
      cardToScopeRef(makeCard({ sourceId: "src-1" })),
    ]);
    expect(scopes).toEqual([
      { kind: "category", categoryId: "cat-a" },
      { kind: "source", sourceId: "src-1" },
    ]);
  });

  it("collects scopes across multiple categories", () => {
    const scopes = uniqueCategoryScopes([
      cardToScopeRef(makeCard({ categoryId: "cat-a" })),
      cardToScopeRef(makeCard({ categoryId: "cat-b" })),
    ]);
    expect(scopes).toEqual([
      { kind: "category", categoryId: "cat-a" },
      { kind: "category", categoryId: "cat-b" },
    ]);
  });
});
