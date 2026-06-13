import { describe, expect, it } from "vitest";
import { createMnemonicCardFromSelection } from "@/features/mnemonic/mnemonic-storage/card-factory";

describe("createMnemonicCardFromSelection", () => {
  it("creates contentDoc-only sections (no legacy HTML dual-write)", () => {
    const card = createMnemonicCardFromSelection(
      "orig-1",
      "Q?",
      "<p>selected <strong>text</strong></p>",
      "cat-1",
    );
    expect(card.sections).toHaveLength(1);
    expect(card.sections[0].contentDoc.version).toBe(4);
    expect(card.sections[0].content).toBeUndefined();
    expect(Object.hasOwn(card.sections[0], "content")).toBe(false);
  });

  it("detects nabrajanja hook type from HTML list content", () => {
    const card = createMnemonicCardFromSelection(
      "orig-1",
      "Q?",
      "<ul><li>Prva</li><li>Druga</li></ul>",
      "cat-1",
    );
    expect(card.hookType).toBe("nabrajanja");
  });
});
