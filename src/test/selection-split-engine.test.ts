import { describe, it, expect } from "vitest";
import {
  deriveTitleAndBody,
  htmlToPlain,
  splitSelection,
  stripTitleFromContent,
} from "@/lib/selection-split-engine";
import { docToHtml } from "@/lib/editor-v4";
import { buildEssayFromSelection } from "@/lib/source-reader/build-essay-payload";
import type { Source } from "@/lib/db-types";

describe("selection-split-engine title dedup", () => {
  it("deriveTitleAndBody strips first words from body", () => {
    const text = "Prvi dio teksta nastavlja se dalje u odgovoru.";
    const html = "<p>Prvi dio teksta nastavlja se dalje u odgovoru.</p>";
    const { title, contentText } = deriveTitleAndBody(text, html);
    expect(title).toBe("Prvi dio teksta nastavlja se dalje u...");
    expect(contentText.toLowerCase()).not.toMatch(/^prvi dio teksta nastavlja se dalje/);
    expect(contentText).toContain("odgovoru");
  });

  it("stripTitleFromContent removes matching HTML block", () => {
    const { contentText, contentHtml } = stripTitleFromContent(
      "čl. 1 Pojam",
      "čl. 1 Pojam\nTekst propisa.",
      "<p>čl. 1 Pojam</p><p>Tekst propisa.</p>",
    );
    expect(contentText).toBe("Tekst propisa.");
    expect(contentHtml).toContain("Tekst propisa.");
    expect(contentHtml).not.toContain("čl. 1 Pojam");
  });

  it("stripTitleFromContent returns original when strip would empty body", () => {
    const original = { contentText: "Samo naslov", contentHtml: "<p>Samo naslov</p>" };
    const result = stripTitleFromContent("Samo naslov", original.contentText, original.contentHtml);
    expect(result.contentText).toBe(original.contentText);
    expect(result.contentHtml).toBe(original.contentHtml);
  });

  it("splitSelection without title line strips firstWords from first content line", () => {
    const text = [
      "Član 1.",
      "Pojam podnesaka je formalni akt kojim stranka pokreće postupak.",
      "Podnesak mora biti u pisanoj formi.",
    ].join("\n");
    const result = splitSelection(text);
    expect(result.hasArticles).toBe(true);
    expect(result.modules).toHaveLength(1);
    const mod = result.modules[0];
    expect(mod.title).toContain("čl. 1");
    expect(mod.title).toContain("Pojam podnesaka");
    expect(mod.contentText).not.toMatch(/^Pojam podnesaka je formalni/);
    expect(mod.contentText).toContain("Podnesak mora biti");
  });
});

describe("buildEssayFromSelection title dedup", () => {
  const source: Source = {
    id: "src-1",
    categoryId: "cat-1",
    title: "Test",
    date: "2026-01-01",
    contentDoc: { version: 4, content: { type: "doc", content: [] } },
    outline: [],
    articles: [],
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    sourceKind: "skripta",
  };

  it("fallback strips exam question from start of selection when duplicated", () => {
    const question = "Objasni pojam podneska";
    const text = "Objasni pojam podneska. Podnesak je formalni akt.";
    const html = "<p>Objasni pojam podneska. Podnesak je formalni akt.</p>";
    const result = buildEssayFromSelection(text, html, question, source);
    const bodyPlain = htmlToPlain(docToHtml(result.args.sections[0].contentDoc));
    expect(result.args.question).toBe(question);
    expect(bodyPlain.toLowerCase()).not.toMatch(/^objasni pojam podneska/);
    expect(bodyPlain).toContain("Podnesak je formalni akt");
  });
});
