import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import { editorV4Extensions, htmlToDoc, docToHtml } from "@/lib/editor-v4";

describe("editor-v4 schema", () => {
  const schema = getSchema(editorV4Extensions);

  it("registers our custom nodes and mark", () => {
    expect(schema.nodes.wikiLink).toBeDefined();
    expect(schema.nodes.mindmapEmbed).toBeDefined();
    expect(schema.marks.keyPart).toBeDefined();
  });

  it("wikiLink is inline + atom", () => {
    const spec = schema.nodes.wikiLink.spec;
    expect(spec.inline).toBe(true);
    expect(spec.atom).toBe(true);
  });

  it("mindmapEmbed is block + atom", () => {
    const spec = schema.nodes.mindmapEmbed.spec;
    expect(spec.atom).toBe(true);
    expect(spec.group).toContain("block");
  });

  it("keyPart mark is non-inclusive", () => {
    const spec = schema.marks.keyPart.spec;
    expect(spec.inclusive).toBe(false);
  });

  it("docToHtml(htmlToDoc(x)) for wiki node emits the canonical data-attrs", () => {
    const doc = htmlToDoc("<p>Vidi [[Ugovor|ugovornog]] tekst.</p>");
    const html = docToHtml(doc);
    expect(html).toContain('data-wikilink="Ugovor"');
    expect(html).toContain('data-display="ugovornog"');
    expect(html).toContain(">ugovornog</a>");
  });

  it("docToHtml emits mindmap div with data-mindmap", () => {
    const doc = htmlToDoc("<p>Pre</p>::mindmap[abc12345-def6-7890-abcd-1234567890ab]<p>Post</p>");
    const html = docToHtml(doc);
    expect(html).toContain('data-mindmap="abc12345-def6-7890-abcd-1234567890ab"');
  });

  it("docToHtml emits key-part mark with the canonical class", () => {
    const doc = htmlToDoc('<p><mark class="key-part-highlight">x</mark></p>');
    const html = docToHtml(doc);
    expect(html).toContain('class="key-part-highlight"');
  });
});
