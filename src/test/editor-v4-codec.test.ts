import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { JSONContent } from "@tiptap/core";
import { htmlToDoc, docToHtml, docToPlainText } from "@/lib/editor-v4";

const FIXTURE_DIR = join(__dirname, "fixtures", "editor-html");
const fixtures = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".html"))
  .sort();

function countNodes(node: JSONContent | undefined, predicate: (n: JSONContent) => boolean): number {
  if (!node) return 0;
  let n = predicate(node) ? 1 : 0;
  for (const child of node.content ?? []) n += countNodes(child, predicate);
  return n;
}

function countMarks(node: JSONContent | undefined, markName: string): number {
  if (!node) return 0;
  let n = (node.marks ?? []).filter((m) => m.type === markName).length;
  for (const child of node.content ?? []) n += countMarks(child, markName);
  return n;
}

function collectWikiTargets(node: JSONContent | undefined): string[] {
  if (!node) return [];
  const out: string[] = [];
  if (node.type === "wikiLink") out.push(String(node.attrs?.target ?? ""));
  for (const child of node.content ?? []) out.push(...collectWikiTargets(child));
  return out;
}

function collectMindmapIds(node: JSONContent | undefined): string[] {
  if (!node) return [];
  const out: string[] = [];
  if (node.type === "mindmapEmbed") out.push(String(node.attrs?.mindmapId ?? ""));
  for (const child of node.content ?? []) out.push(...collectMindmapIds(child));
  return out;
}

describe("editor-v4 codecs — fixture round-trip", () => {
  it("loaded 20 fixtures", () => {
    expect(fixtures).toHaveLength(20);
  });

  for (const name of fixtures) {
    it(`htmlToDoc + round-trip: ${name}`, () => {
      const html = readFileSync(join(FIXTURE_DIR, name), "utf8");
      const doc = htmlToDoc(html);
      expect(doc.version).toBe(4);
      expect(doc.content.type).toBe("doc");

      const html2 = docToHtml(doc);
      const doc2 = htmlToDoc(html2);

      // Structural counts must survive a round-trip.
      const w1 = collectWikiTargets(doc.content);
      const w2 = collectWikiTargets(doc2.content);
      expect(w2).toEqual(w1);

      const m1 = collectMindmapIds(doc.content);
      const m2 = collectMindmapIds(doc2.content);
      expect(m2).toEqual(m1);

      expect(countMarks(doc2.content, "keyPart")).toBe(countMarks(doc.content, "keyPart"));

      // Block topology should stabilise after one round-trip.
      const headings1 = countNodes(doc.content, (n) => n.type === "heading");
      const headings2 = countNodes(doc2.content, (n) => n.type === "heading");
      expect(headings2).toBe(headings1);
    });
  }
});

describe("editor-v4 codecs — specific guarantees", () => {
  it("wiki-link inside <code> is NOT converted", () => {
    const html = readFileSync(join(FIXTURE_DIR, "05-blockquote-code.html"), "utf8");
    const doc = htmlToDoc(html);
    const wiki = collectWikiTargets(doc.content);
    expect(wiki).toEqual(["Naslov"]); // only the one inside the blockquote
    // mindmap in code block must not become an embed
    expect(collectMindmapIds(doc.content)).toHaveLength(0);
  });

  it("piped wiki link preserves display vs target", () => {
    const html = readFileSync(join(FIXTURE_DIR, "08-wiki-link-piped.html"), "utf8");
    const doc = htmlToDoc(html);
    const found: Array<{ target: string; display: string; hasPipe: boolean }> = [];
    const walk = (n: JSONContent | undefined): void => {
      if (!n) return;
      if (n.type === "wikiLink") {
        found.push({
          target: String(n.attrs?.target ?? ""),
          display: String(n.attrs?.display ?? ""),
          hasPipe: Boolean(n.attrs?.hasPipe),
        });
      }
      (n.content ?? []).forEach(walk);
    };
    walk(doc.content);
    expect(found).toEqual([{ target: "Krivično djelo", display: "krivičnog djela", hasPipe: true }]);
  });

  it("mindmap embed survives as block node", () => {
    const html = readFileSync(join(FIXTURE_DIR, "09-mindmap-embed.html"), "utf8");
    const doc = htmlToDoc(html);
    expect(collectMindmapIds(doc.content)).toEqual([
      "11111111-2222-3333-4444-555555555555",
    ]);
  });

  it("key-part mark survives as a typed mark", () => {
    const html = readFileSync(join(FIXTURE_DIR, "10-key-part-mark.html"), "utf8");
    const doc = htmlToDoc(html);
    expect(countMarks(doc.content, "keyPart")).toBe(1);
  });

  it("multiple wiki links in one paragraph are all captured", () => {
    const html = readFileSync(join(FIXTURE_DIR, "18-multiple-wiki-same-paragraph.html"), "utf8");
    const doc = htmlToDoc(html);
    expect(collectWikiTargets(doc.content)).toEqual(["Alfa", "Beta", "Gama"]);
  });

  it("strips scripts and event handlers (DOMPurify pass)", () => {
    const html = readFileSync(join(FIXTURE_DIR, "17-malformed-cleanup.html"), "utf8");
    const doc = htmlToDoc(html);
    const text = docToPlainText(doc);
    expect(text).not.toContain("alert");
    expect(text).not.toContain("onclick");
    const rendered = docToHtml(doc);
    expect(rendered).not.toMatch(/<script/i);
    expect(rendered).not.toMatch(/onclick=/i);
  });

  it("docToPlainText emits wiki display, drops mindmap, joins blocks", () => {
    const html = readFileSync(join(FIXTURE_DIR, "20-real-card-section.html"), "utf8");
    const doc = htmlToDoc(html);
    const text = docToPlainText(doc);
    expect(text).toContain("Bitni elementi ugovora");
    expect(text).toContain("ugovornog odnosa"); // piped display
    expect(text).toContain("essentialia negotii"); // key-part body
    expect(text).not.toContain("12345678-aaaa"); // mindmap id not in plain text
  });
});
