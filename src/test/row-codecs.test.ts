import { describe, expect, it } from "vitest";
import { decodeCard, CardDecodeError } from "@/lib/persistence/sqlite/row-codecs";

describe("decodeCard", () => {
  const baseRow = {
    id: "card-1",
    categoryId: "cat-1",
    subcategoryId: null,
    chapterId: null,
    type: "essay",
    createdAt: 1_700_000_000_000,
    updatedAt: null,
    sourceId: null,
    frequencyTag: null,
    sourceType: null,
    parentId: null,
    isEndangered: 0,
  };

  it("decodes a valid JSON payload", () => {
    const card = decodeCard({
      ...baseRow,
      payload: JSON.stringify({
        id: "card-1",
        categoryId: "cat-1",
        type: "essay",
        question: "Q?",
        sections: [],
        createdAt: 1_700_000_000_000,
        readCount: 2,
      }),
    });
    expect(card.id).toBe("card-1");
    expect(card.question).toBe("Q?");
    expect(card.readCount).toBe(2);
  });

  it("coerces Uint8Array payload", () => {
    const json = JSON.stringify({
      id: "card-1",
      categoryId: "cat-1",
      type: "flash",
      question: "Flash",
      sections: [],
      createdAt: 1,
      readCount: 0,
    });
    const card = decodeCard({
      ...baseRow,
      type: "flash",
      payload: new TextEncoder().encode(json),
    });
    expect(card.type).toBe("flash");
    expect(card.question).toBe("Flash");
  });

  it("falls back to SQL columns when payload is empty", () => {
    const card = decodeCard({
      ...baseRow,
      payload: "",
    });
    expect(card.id).toBe("card-1");
    expect(card.categoryId).toBe("cat-1");
    expect(card.question).toBe("");
    expect(card.sections).toEqual([]);
  });

  it("uses SQL categoryId when missing from payload JSON", () => {
    const card = decodeCard({
      ...baseRow,
      payload: JSON.stringify({
        id: "card-1",
        type: "essay",
        question: "Q",
        sections: [],
        createdAt: 1,
        readCount: 0,
      }),
    });
    expect(card.categoryId).toBe("cat-1");
  });

  it("throws when neither payload nor columns yield a card", () => {
    expect(() =>
      decodeCard({ payload: "", id: "", categoryId: "" }),
    ).toThrow(CardDecodeError);
  });
});
