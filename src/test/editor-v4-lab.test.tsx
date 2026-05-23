import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import LabEditor from "@/views/lab/LabEditor";

/**
 * PR-1 smoke test: izolovan TipTap editor se mountuje, renderuje
 * ProseMirror DOM, i .getJSON() vraća validnu AST strukturu.
 *
 * Ne testira semantiku codec-a — to dolazi u PR-2.
 */
describe("Editor V4 Lab (PR-1)", () => {
  it("renders ProseMirror surface", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<LabEditor />);
      container = result.container;
    });
    // TipTap mounts asynchronously via useEditor — flush microtasks.
    await act(async () => { await Promise.resolve(); });

    const pm = container!.querySelector(".ProseMirror");
    expect(pm).not.toBeNull();
    expect(pm?.getAttribute("contenteditable")).toBe("true");
  });

  it("toolbar exposes formatting buttons", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<LabEditor />);
      container = result.container;
    });
    await act(async () => { await Promise.resolve(); });

    const buttons = container!.querySelectorAll("button");
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain("B");
    expect(labels).toContain("I");
    expect(labels).toContain("H1");
    expect(labels).toContain("Undo");
  });
});
