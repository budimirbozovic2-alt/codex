/**
 * <EditorView> + <ContentRenderer> read-only render path tests.
 *
 * - V4 AST path renders the canonical ProseMirror DOM (with `.ProseMirror`,
 *   atomic nodes for wiki-link / mindmap, key-part marks) and is fully
 *   `contenteditable="false"`.
 * - Legacy SafeHtml fallback kicks in when `contentDoc` is missing/invalid,
 *   sanitizes the supplied HTML and (when requested) overlays key-parts
 *   highlight without going through the AST.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ContentRenderer } from "@/components/ui/ContentRenderer";
import { EditorView } from "@/lib/editor-v4/EditorView";
import type { EditorDoc } from "@/lib/editor-v4";

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

describe("ContentRenderer", () => {
  it("uses AST branch when contentDoc is V4 — ignores `html` and `highlight`", () => {
    const { container } = render(
      <ContentRenderer
        doc={richDoc}
        html="<p>fallback should not render</p>"
        highlight={{ keyParts: ["fallback"] }}
        className="card-prose"
      />,
    );
    expect(container.querySelector(".ProseMirror")).not.toBeNull();
    expect(container.textContent).not.toContain("fallback should not render");
  });

  it("falls back to sanitized SafeHtml when doc is missing", () => {
    const { container } = render(
      <ContentRenderer
        html="<p>Hello <script>alert(1)</script>world</p>"
        className="legacy"
      />,
    );
    expect(container.querySelector(".ProseMirror")).toBeNull();
    const div = container.querySelector("div.legacy") as HTMLElement | null;
    expect(div).not.toBeNull();
    // DOMPurify must have stripped the <script>.
    expect(div?.innerHTML).not.toContain("<script");
    expect(div?.textContent).toContain("Hello");
    expect(div?.textContent).toContain("world");
  });

  it("applies keyParts highlight only in fallback branch", () => {
    const { container } = render(
      <ContentRenderer
        html="<p>ovo je vazan dio teksta</p>"
        highlight={{ keyParts: ["vazan dio"] }}
      />,
    );
    expect(container.querySelector("mark.key-part-highlight")?.textContent).toBe("vazan dio");
  });

  it("ignores doc objects whose version is not 4", () => {
    const stale = { version: 3, content: { type: "doc", content: [] } } as unknown as EditorDoc;
    const { container } = render(
      <ContentRenderer doc={stale} html="<p>legacy</p>" />,
    );
    expect(container.querySelector(".ProseMirror")).toBeNull();
    expect(container.textContent).toContain("legacy");
  });
});
