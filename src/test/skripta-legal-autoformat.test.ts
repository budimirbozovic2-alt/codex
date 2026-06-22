import { describe, it, expect } from "vitest";
import { autoFormatLegalProvisions } from "@/lib/skripta-legal-autoformat";
import { htmlToDoc, docToHtml } from "@/lib/editor-v4";

describe("autoFormatLegalProvisions", () => {
  it("wraps blockquotes in legal-provision shells", () => {
    const { html, count } = autoFormatLegalProvisions(
      "<p>Uvod.</p><blockquote><p>Član 1. Tekst zakona.</p></blockquote>",
    );
    expect(count).toBe(1);
    expect(html).toContain('class="legal-provision"');
    expect(html).toContain("Član 1.");
    expect(html).not.toContain("<blockquote");
  });

  it("wraps paragraphs that start like statutory citations", () => {
    const { html, count } = autoFormatLegalProvisions(
      "<p>Teorija.</p><p>Prema zakonu o upravnom postupku, rok je 15 dana.</p>",
    );
    expect(count).toBe(1);
    expect(html).toMatch(/<div class="legal-provision">[\s\S]*Prema zakonu/);
  });

  it("skips blocks already inside legal-provision", () => {
    const input =
      '<div class="legal-provision"><p>Član 2. Već označeno.</p></div>';
    const { count, html } = autoFormatLegalProvisions(input);
    expect(count).toBe(0);
    expect(html).toBe(input);
  });

  it("round-trips through the V4 codec as legalProvision nodes", () => {
    const { html } = autoFormatLegalProvisions(
      "<blockquote><p>Član 5. Citat.</p></blockquote>",
    );
    const doc = htmlToDoc(html);
    const out = docToHtml(doc);
    expect(out).toContain('class="legal-provision"');
    expect(out).toContain("Član 5.");
  });
});
