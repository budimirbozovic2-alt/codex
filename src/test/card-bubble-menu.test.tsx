/**
 * Card BubbleMenu smoke tests.
 *
 * Mounts `CardSelectionEditor` (read-only EditorV4 + CardBubbleMenu) and
 * verifies the ProseMirror surface renders correctly.
 *
 * Interaction-level assertions (BubbleMenu open / button clicks) live in
 * Playwright — TipTap's Floating UI positioning + jsdom selection support
 * are not reliable enough for unit assertions.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CardSelectionEditor } from "@/components/card-list/CardSelectionEditor";
import { htmlToDoc } from "@/lib/editor-v4";
import { makeQueryWrapper } from "./helpers/queryWrapper";

const Wrapper = makeQueryWrapper();


vi.mock("@/domains/mnemonic", () => ({
  loadMnemonicCards: vi.fn(async () => []),
  saveMnemonicCards: vi.fn(async () => {}),
  createMnemonicCardFromSelection: vi.fn(() => ({ id: "m1" })),
}));

function waitMicroTask() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

describe("CardSelectionEditor (PR-7a / M5)", () => {
  it("mounts read-only EditorV4 from contentDoc and exposes ProseMirror surface", async () => {
    const doc = htmlToDoc("<p>Ovo je test sadržaj jedne sekcije.</p>");
    const { container } = render(
      <Wrapper>
        <CardSelectionEditor
          cardId="c1"
          question="Pitanje?"
          category="cat-1"
          categoryId="cat-1"
          contentDoc={doc}
        />
      </Wrapper>
    );

    await waitMicroTask();

    const pm = container.querySelector(".ProseMirror") as HTMLElement | null;
    expect(pm).not.toBeNull();
    // editable={false} ⇒ contenteditable should be "false"
    expect(pm?.getAttribute("contenteditable")).toBe("false");
    // No stale tooltip attributes.
    expect(container.querySelector("[data-mnemo-tooltip]")).toBeNull();
  });

  it("renders provided contentDoc with marks intact", async () => {
    const doc = htmlToDoc("<p><strong>fallback</strong> putanja</p>");
    const { container } = render(
      <Wrapper>
        <CardSelectionEditor
          cardId="c2"
          question="?"
          category="cat-1"
          categoryId="cat-1"
          contentDoc={doc}
        />
      </Wrapper>
    );

    await waitMicroTask();
    const pm = container.querySelector(".ProseMirror");
    expect(pm?.textContent).toContain("fallback");
    expect(pm?.querySelector("strong")).not.toBeNull();
  });

});
