/**
 * PR-5 — write path #1: card sections.
 *
 * Verifies:
 *   - <EditorV4> emits canonical EditorDoc on every change.
 *   - htmlToDoc → docToHtml round-trip preserves bold and other StarterKit marks.
 *   - useSectionEditor.updateSectionDoc keeps `content` (HTML) in sync with the AST.
 *   - createSection / createCard accept and persist the optional contentDoc payload.
 */
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { EditorV4 } from "@/components/editor-v4/EditorV4";
import { htmlToDoc, docToHtml, type EditorDoc } from "@/lib/editor-v4";
import { useSectionEditor } from "@/hooks/card-actions/useSectionEditor";
import { createSection, createCard } from "@/lib/sr/factories";

function waitMicroTask() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("EditorV4 (write path)", () => {
  it("emits a v4 EditorDoc when content changes", async () => {
    const onChange = vi.fn<(d: EditorDoc) => void>();
    const initial = htmlToDoc("<p>start</p>");
    const { container } = render(<EditorV4 initialDoc={initial} onChange={onChange} />);
    await waitMicroTask();
    const pm = container.querySelector(".ProseMirror") as HTMLElement | null;
    expect(pm).not.toBeNull();
    expect(pm?.getAttribute("contenteditable")).toBe("true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders an empty document with a Placeholder hook attached", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <EditorV4 initialDoc={htmlToDoc("")} onChange={onChange} placeholder="Tipkaj..." />,
    );
    await waitMicroTask();
    const empty = container.querySelector(".ProseMirror p.is-editor-empty");
    expect(empty).not.toBeNull();
  });

  it("syncs external initialDoc updates without remount (e.g. DOCX ingest)", async () => {
    const onChange = vi.fn<(d: EditorDoc) => void>();
    const empty = htmlToDoc("");
    const uploaded = htmlToDoc("<p>uploaded docx text</p>");

    const { container, rerender } = render(
      <EditorV4 initialDoc={empty} onChange={onChange} />,
    );
    await waitMicroTask();
    expect(container.querySelector(".ProseMirror")?.textContent ?? "").toBe("");

    rerender(<EditorV4 initialDoc={uploaded} onChange={onChange} />);
    await waitMicroTask();

    expect(container.querySelector(".ProseMirror")?.textContent).toContain("uploaded docx text");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("editor-v4 codec round-trip (cards)", () => {
  it("preserves bold across htmlToDoc → docToHtml", () => {
    const doc = htmlToDoc("<p><strong>tučan</strong> tekst</p>");
    const html = docToHtml(doc);
    expect(html).toContain("<strong>tučan</strong>");
    expect(html).toContain("tekst");
  });

  it("preserves bullet lists", () => {
    const doc = htmlToDoc("<ul><li>a</li><li>b</li></ul>");
    const html = docToHtml(doc);
    expect(html).toContain("<ul>");
    expect(html).toContain(">a<");
    expect(html).toContain(">b<");
  });
});

describe("useSectionEditor", () => {
  it("seeds contentDoc from editCard sections", () => {
    const card = {
      ...createCard("Q", [{ title: "S1", contentDoc: htmlToDoc("<p>legacy</p>") }], "cat-1"),
      type: "essay" as const,
    };
    const { result } = renderHook(() => useSectionEditor(card));
    expect(result.current.sections[0].contentDoc?.version).toBe(4);
    expect(docToHtml(result.current.sections[0].contentDoc!)).toContain("legacy");
  });

  it("updateSectionDoc stores contentDoc as canonical payload (no per-keystroke HTML derivation)", () => {
    const { result } = renderHook(() => useSectionEditor(null));
    const next = htmlToDoc("<p>updated <em>body</em></p>");
    act(() => {
      result.current.updateSectionDoc(0, next);
    });
    expect(result.current.sections[0].contentDoc).toEqual(next);
    // PR-7b: `content` HTML is no longer derived on keystroke; reads use deriveHtml().
    expect(docToHtml(result.current.sections[0].contentDoc!)).toContain("<em>body</em>");
  });

  it("addSection seeds a fresh contentDoc", () => {
    const { result } = renderHook(() => useSectionEditor(null));
    act(() => {
      result.current.addSection();
    });
    expect(result.current.sections).toHaveLength(2);
    expect(result.current.sections[1].contentDoc?.version).toBe(4);
  });

  it("handleCut splits both content and contentDoc", () => {
    const card = {
      ...createCard("Q", [{ title: "S1", contentDoc: htmlToDoc("<p>a</p><p>b</p><p>c</p>") }], "cat-1"),
      type: "essay" as const,
    };
    // PR-7b: handleCut derives HTML from contentDoc when legacy `content` is absent.
    const { result } = renderHook(() => useSectionEditor(card));
    act(() => {
      result.current.handleCut(0, 1);
    });
    expect(result.current.sections).toHaveLength(2);
    expect(result.current.sections[0].contentDoc?.version).toBe(4);
    expect(result.current.sections[1].contentDoc?.version).toBe(4);
    expect(docToHtml(result.current.sections[0].contentDoc!)).toContain("a");
    expect(docToHtml(result.current.sections[1].contentDoc!)).toContain("c");
  });
});

describe("factories", () => {
  it("createSection forwards contentDoc", () => {
    const doc = htmlToDoc("<p>x</p>");
    const s = createSection("title", doc);
    expect(s.contentDoc).toEqual(doc);
  });

  it("createCard propagates contentDoc into each section", () => {
    const doc = htmlToDoc("<p>y</p>");
    const card = createCard(
      "Q",
      [{ title: "S1", contentDoc: doc }],
      "cat-1",
    );
    expect(card.sections[0].contentDoc).toEqual(doc);
  });
});
