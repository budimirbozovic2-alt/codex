/**
 * SourceBubbleMenu — selection payload + action wiring.
 * BubbleMenu positioning is mocked; TipTap editor is real.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourceBubbleMenu } from "@/components/source-reader/SourceBubbleMenu";
import { createSourceTestEditor } from "./helpers/mock-source-editor";
import type { Editor } from "@/lib/editor-v4";

vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bubble-menu">{children}</div>
  ),
}));

describe("SourceBubbleMenu", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("forwards selected text + html to onSplit", () => {
    editor = createSourceTestEditor();
    const onSplit = vi.fn();
    render(
      <SourceBubbleMenu
        editor={editor}
        editMode={false}
        onSplit={onSplit}
        onLinkToExisting={vi.fn()}
        onAddMnemo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Napravi esej (S)"));
    expect(onSplit).toHaveBeenCalledTimes(1);
    const [text, html] = onSplit.mock.calls[0];
    expect(text.length).toBeGreaterThanOrEqual(5);
    expect(html.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("Selektovani");
  });

  it("forwards selection to onLinkToExisting and onAddMnemo", () => {
    editor = createSourceTestEditor("Tekst za povezivanje sa esejem.");
    const onLink = vi.fn();
    const onMnemo = vi.fn();
    render(
      <SourceBubbleMenu
        editor={editor}
        editMode={false}
        onSplit={vi.fn()}
        onLinkToExisting={onLink}
        onAddMnemo={onMnemo}
      />,
    );

    fireEvent.click(screen.getByTitle("Poveži sa postojećim esejem"));
    fireEvent.click(screen.getByTitle("Mnemo kuka"));
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onMnemo).toHaveBeenCalledTimes(1);
    expect(onMnemo.mock.calls[0][0]).toMatch(/Tekst za povezivanje/);
  });

  it("does not call onSplit when selection is too short", () => {
    editor = createSourceTestEditor("krat", { selectAll: true });
    const onSplit = vi.fn();
    render(
      <SourceBubbleMenu
        editor={editor}
        editMode={false}
        onSplit={onSplit}
        onLinkToExisting={vi.fn()}
        onAddMnemo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Napravi esej (S)"));
    expect(onSplit).not.toHaveBeenCalled();
  });

  it("shows formatting controls only in edit mode", () => {
    editor = createSourceTestEditor();
    const { rerender } = render(
      <SourceBubbleMenu
        editor={editor}
        editMode={false}
        onSplit={vi.fn()}
        onLinkToExisting={vi.fn()}
        onAddMnemo={vi.fn()}
      />,
    );
    expect(screen.queryByTitle("Naslov 1")).toBeNull();

    rerender(
      <SourceBubbleMenu
        editor={editor}
        editMode={true}
        onSplit={vi.fn()}
        onLinkToExisting={vi.fn()}
        onAddMnemo={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Naslov 1")).toBeInTheDocument();
  });
});
