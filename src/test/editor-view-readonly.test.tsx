/**
 * <EditorView> + <ContentRenderer> read-only render path tests.
 *
 * PR-7d M2.1: ContentRenderer delegates to <AstNodeRenderer> (pure React
 * walker, no TipTap). The `html` fallback prop is gone — callers must
 * pre-convert via `htmlToDoc` at the boundary.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ContentRenderer } from "@/components/ui/ContentRenderer";
import { EditorView } from "@/lib/editor-v4/EditorView";
import { htmlToDoc, type EditorDoc } from "@/lib/editor-v4";

const richDoc: EditorDoc = {
  version: 4,
  content: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Naslov" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "Bold" },
          { type: "text", text: " i " },
          { type: "wikiLink", attrs: { target: "Ugovor", display: "Ugovor", hasPipe: false } },
          { type: "text", text: " plus " },
          { type: "text", marks: [{ type: "keyPart" }], text: "kljuc" },
        ],
      },
      { type: "mindmapEmbed", attrs: { mindmapId: "mm-1" } },
    ],
  },
};

describe("EditorView (V4 read-only)", () => {
  it("renders heading, wiki-link, mindmap embed and key-part mark inside a non-editable .ProseMirror", () => {
    const { container } = render(<EditorView doc={richDoc} className="card-prose" />);
    const pm = container.querySelector(".ProseMirror") as HTMLElement | null;
    expect(pm).not.toBeNull();
    expect(pm?.getAttribute("contenteditable")).toBe("false");
    expect(pm?.classList.contains("card-prose")).toBe(true);
    expect(container.querySelector("h2")?.textContent).toBe("Naslov");
    expect(container.querySelector("a[data-wikilink='Ugovor']")).not.toBeNull();
    expect(container.querySelector("[data-mindmap='mm-1']")).not.toBeNull();
    expect(container.querySelector("mark.key-part-highlight")?.textContent).toBe("kljuc");
  });
});

describe("ContentRenderer (AST walker)", () => {
  it("renders V4 doc through pure React — heading, bold, wiki-link, key-part, mindmap", () => {
    const { container } = render(<ContentRenderer doc={richDoc} className="card-prose" />);
    expect(container.querySelector("h2")?.textContent).toBe("Naslov");
    expect(container.querySelector("strong")?.textContent).toBe("Bold");
    expect(container.querySelector("a[data-wikilink='Ugovor']")).not.toBeNull();
    expect(container.querySelector("mark.key-part-highlight")?.textContent).toBe("kljuc");
    expect(container.querySelector("[data-mindmap='mm-1']")).not.toBeNull();
    // No ProseMirror instance — this is the perf win.
    expect(container.querySelector(".ProseMirror")).toBeNull();
  });

  it("renders empty when doc is missing or wrong version", () => {
    const { container: c1 } = render(<ContentRenderer doc={null} />);
    expect(c1.textContent).toBe("");
    const stale = { version: 3, content: { type: "doc", content: [] } } as unknown as EditorDoc;
    const { container: c2 } = render(<ContentRenderer doc={stale} />);
    expect(c2.textContent).toBe("");
  });

  it("boundary conversion: htmlToDoc → ContentRenderer renders legacy HTML safely", () => {
    const doc = htmlToDoc("<p>Hello <script>alert(1)</script>world</p>");
    const { container } = render(<ContentRenderer doc={doc} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).toContain("world");
  });
});
