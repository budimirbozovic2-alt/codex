import { describe, it, expect } from "vitest";
import {
  isTemplateExport,
  convertTemplateToParsedBackup,
  TEMPLATE_EXPORT_VERSION,
} from "@/lib/backup/template-import";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";

const CAT_ID = "11111111-1111-4111-8111-111111111111";
const CARD_ID = "22222222-2222-4222-8222-222222222222";

function minimalTemplate() {
  return {
    version: TEMPLATE_EXPORT_VERSION,
    type: "template",
    categories: [{
      id: CAT_ID,
      name: "Test predmet",
      sortOrder: 0,
      subcategories: [],
    }],
    subcategories: {},
    cards: [{
      id: CARD_ID,
      question: "Šta je X?",
      sections: [{ title: "Odgovor", content: "<p>Definicija</p>" }],
      categoryId: CAT_ID,
      subcategoryId: "",
      chapterId: "",
      type: "essay",
      tags: [],
    }],
  };
}

describe("template-import", () => {
  it("isTemplateExport detects v2 template files", () => {
    expect(isTemplateExport(minimalTemplate())).toBe(true);
    expect(isTemplateExport({ version: 7, type: "full", cards: [] })).toBe(false);
    expect(isTemplateExport({ version: 2, type: "full", cards: [] })).toBe(false);
  });

  it("convertTemplateToParsedBackup maps HTML sections to contentDoc", () => {
    const parsed = convertTemplateToParsedBackup(minimalTemplate());

    expect(parsed.version).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.type).toBe("template");
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].question).toBe("Šta je X?");
    expect(parsed.cards[0].sections[0].contentDoc.version).toBe(4);
    expect(parsed.cards[0].readCount).toBe(0);
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.reviewLog).toEqual([]);
  });

  it("rejects non-template payloads", () => {
    expect(() => convertTemplateToParsedBackup({ version: 5, type: "emergency-backup" }))
      .toThrow(/nije template export/i);
  });
});
