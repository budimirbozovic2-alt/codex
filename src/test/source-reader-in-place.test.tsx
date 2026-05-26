/**
 * PR-7a / M5 — Source-reader in-place editing smoke tests.
 *
 * Verifies that `SourceContent` mounts `<EditorV4>` (with `editable` mirroring
 * the read/edit toggle), and that the legacy DOM-selection layer
 * (`useSourceSelection` + `SourceTooltip` + `SourceContextMenu`) was removed.
 *
 * Heavy interaction paths (BubbleMenu open, format toggles, Smart-Split
 * payload) are exercised end-to-end in Playwright — TipTap's Floating UI
 * positioning is not reliable under jsdom.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SourceContent } from "@/components/source-reader/SourceContent";
import type { Source } from "@/lib/sources-storage";

function waitMicroTask() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

const baseSource = (overrides: Partial<Source> = {}): Source => ({
  id: "s1",
  title: "Test",
  categoryId: "cat-1",
  htmlContent: "<p>Tijelo izvora — više od pet znakova.</p>",
  outline: [],
  articles: [],
  examQuestions: [],
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
} as unknown as Source);

describe("SourceContent (PR-7a / M5)", () => {
  it("mounts EditorV4 in read mode by default", async () => {
    const { container } = render(
      <SourceContent
        source={baseSource()}
        editMode={false}
        onSourceUpdated={() => {}}
        onEditorReady={() => {}}
      />
    );
    await waitMicroTask();
    const pm = container.querySelector(".ProseMirror") as HTMLElement | null;
    expect(pm).not.toBeNull();
    expect(pm?.getAttribute("contenteditable")).toBe("false");
  });

  it("flips contenteditable when editMode toggles", async () => {
    const { container, rerender } = render(
      <SourceContent
        source={baseSource()}
        editMode={false}
        onSourceUpdated={() => {}}
        onEditorReady={() => {}}
      />
    );
    await waitMicroTask();
    rerender(
      <SourceContent
        source={baseSource()}
        editMode={true}
        onSourceUpdated={() => {}}
        onEditorReady={() => {}}
      />
    );
    await waitMicroTask();
    const pm = container.querySelector(".ProseMirror") as HTMLElement | null;
    expect(pm?.getAttribute("contenteditable")).toBe("true");
  });

  it("does not render the legacy SourceTooltip / SourceContextMenu modules", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const gone = [
      "src/components/source-reader/SourceTooltip.tsx",
      "src/components/source-reader/SourceContextMenu.tsx",
      "src/components/source-reader/SourceEditToolbar.tsx",
      "src/hooks/source-reader/useSourceSelection.ts",
    ];
    for (const rel of gone) {
      expect(fs.existsSync(path.resolve(process.cwd(), rel))).toBe(false);
    }
  });
});
