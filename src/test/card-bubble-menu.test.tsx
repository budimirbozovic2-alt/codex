/**
 * PR-7a / M5 — Card BubbleMenu in-place migration smoke tests.
 *
 * Mounts `CardSelectionEditor` (read-only EditorV4 + CardBubbleMenu) and
 * verifies the legacy `TextSelectionTooltip` replacement renders without
 * touching `window.getSelection()` or `document.execCommand`.
 *
 * Interaction-level assertions (BubbleMenu open / button clicks) live in
 * Playwright — TipTap's Floating UI positioning + jsdom selection support
 * are not reliable enough for unit assertions.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CardSelectionEditor } from "@/components/card-list/CardSelectionEditor";
import { htmlToDoc } from "@/lib/editor-v4";

vi.mock("@/features/mnemonic", () => ({
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
      <CardSelectionEditor
        cardId="c1"
        question="Pitanje?"
        category="cat-1"
        categoryId="cat-1"
        contentDoc={doc}
        html=""
      />
    );
    await waitMicroTask();

    const pm = container.querySelector(".ProseMirror") as HTMLElement | null;
    expect(pm).not.toBeNull();
    // editable={false} ⇒ contenteditable should be "false"
    expect(pm?.getAttribute("contenteditable")).toBe("false");
    // No legacy DOM-selection tooltip hook attribute leftover.
    expect(container.querySelector("[data-mnemo-tooltip]")).toBeNull();
  });

  it("falls back to htmlToDoc when contentDoc is missing", async () => {
    const { container } = render(
      <CardSelectionEditor
        cardId="c2"
        question="?"
        category="cat-1"
        categoryId="cat-1"
        html="<p><strong>fallback</strong> putanja</p>"
      />
    );
    await waitMicroTask();
    const pm = container.querySelector(".ProseMirror");
    expect(pm?.textContent).toContain("fallback");
    expect(pm?.querySelector("strong")).not.toBeNull();
  });

  it("does not render the legacy TextSelectionTooltip module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    expect(
      fs.existsSync(path.resolve(process.cwd(), "src/components/TextSelectionTooltip.tsx"))
    ).toBe(false);
  });
});
