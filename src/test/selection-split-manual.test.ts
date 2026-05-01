import { describe, it, expect } from "vitest";
import {
  createEmptyModule,
  splitModuleByDelimiter,
  type SelectionModule,
} from "@/lib/selection-split-engine";

describe("createEmptyModule", () => {
  it("returns a module with empty content and a default title", () => {
    const m = createEmptyModule();
    expect(m.articleNum).toBe("");
    expect(m.title).toBe("Novi modul");
    expect(m.contentText).toBe("");
    expect(m.contentHtml).toBe("");
    expect(m.plainSnippet).toBe("Novi modul");
  });

  it("uses a custom title when provided", () => {
    expect(createEmptyModule("Pojam ugovora").title).toBe("Pojam ugovora");
  });
});

describe("splitModuleByDelimiter", () => {
  const baseMod = (text: string, title = "Originalni modul"): SelectionModule => ({
    articleNum: "",
    title,
    contentText: text,
    contentHtml: text.split("\n").map(l => `<p>${l}</p>`).join("\n"),
    plainSnippet: text,
  });

  it("splits on blank lines into separate modules", () => {
    const mod = baseMod("Prvi paragraf.\n\nDrugi paragraf.\n\nTreći paragraf.");
    const out = splitModuleByDelimiter(mod, "blank-line");
    expect(out).toHaveLength(3);
    expect(out[0].title).toBe("Originalni modul"); // first inherits original title
    expect(out[1].contentText).toContain("Drugi");
    expect(out[2].contentText).toContain("Treći");
  });

  it("returns the original module untouched when no blank-line splits found", () => {
    const mod = baseMod("Samo jedan paragraf bez praznih linija.");
    const out = splitModuleByDelimiter(mod, "blank-line");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(mod);
  });

  it("splits on a custom literal delimiter", () => {
    const mod = baseMod("Dio A\n---\nDio B\n---\nDio C");
    const out = splitModuleByDelimiter(mod, { custom: "---" });
    expect(out).toHaveLength(3);
    expect(out[1].contentText).toContain("Dio B");
  });

  it("splits on Član markers via the article mode", () => {
    const mod = baseMod(
      "Član 1\nPrvi član sadržaj.\n\nČlan 2\nDrugi član sadržaj.",
    );
    const out = splitModuleByDelimiter(mod, "article");
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0].articleNum).toBe("1");
    expect(out[1].articleNum).toBe("2");
  });

  it("returns the original when custom delimiter is empty", () => {
    const mod = baseMod("nešto");
    const out = splitModuleByDelimiter(mod, { custom: "" });
    expect(out).toHaveLength(1);
  });

  it("preserves the original module's articleNum on the first chunk only", () => {
    const mod: SelectionModule = {
      articleNum: "59",
      title: "čl. 59 Pojam",
      contentText: "Stav 1.\n\nStav 2.",
      contentHtml: "<p>Stav 1.</p>\n<p>Stav 2.</p>",
      plainSnippet: "Član 59\nStav 1.\n\nStav 2.",
    };
    const out = splitModuleByDelimiter(mod, "blank-line");
    expect(out).toHaveLength(2);
    expect(out[0].articleNum).toBe("59");
    expect(out[1].articleNum).toBe("");
  });
});
