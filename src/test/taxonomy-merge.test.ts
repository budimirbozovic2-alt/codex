/**
 * taxonomy-merge — full 3-level remap & merge contract.
 *
 * Cilj: garantovati da se hijerarhija (predmet → potkategorija → glava)
 * iz backupa **tačno** prepiše u refaktorisanu bazu, čak i kad postoji
 * predmet sa istim imenom. Bez ovog modula `card.subcategoryId` /
 * `card.chapterId` UUID-i iz backupa ostali bi siročad i resolver bi
 * obrisao hijerarhiju.
 */
import { describe, it, expect } from "vitest";
import {
  buildTaxonomyRemap,
  applyTaxonomyRemap,
} from "@/lib/backup/taxonomy-merge";
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

function cat(
  id: string,
  name: string,
  subs: { id: string; name: string; chapters?: { id: string; name: string }[] }[] = [],
): CategoryRecord {
  return {
    id,
    name,
    sortOrder: 0,
    subcategories: subs.map((s, i) => ({
      id: s.id,
      name: s.name,
      sortOrder: i,
      chapters: (s.chapters ?? []).map((c, j) => ({ id: c.id, name: c.name, sortOrder: j })),
    })),
  };
}

function card(id: string, categoryId: string, subcategoryId?: string, chapterId?: string): Card {
  return {
    id,
    categoryId,
    subcategoryId,
    chapterId,
    question: "",
    sections: [],
    tags: [],
    createdAt: 0,
    readCount: 0,
    type: "essay",
    errorLog: [],
    keyParts: [],
    childCardIds: [],
  } as unknown as Card;
}

function emptyParsed(): ParsedBackup {
  return {
    version: 7, type: "full",
    cards: [], categories: [], sources: [], mindMaps: [],
    knowledgeBaseArticles: [], mnemonics: [], reviewLog: [],
    diary: [], calibrationLog: [], latencyLog: [], slippageLog: [],
    activityLog: [], disciplineLog: [], pomodoroLog: [],
    majorSystem: [], mnemonicTestLog: [], settings: [],
  } as unknown as ParsedBackup;
}

describe("buildTaxonomyRemap — merge mode", () => {
  it("adopts novel subcategory wholesale (cards keep backup UUIDs)", () => {
    const parsed = [cat("b-cat", "Krivično", [
      { id: "b-sub", name: "Opšti dio", chapters: [{ id: "b-ch", name: "Glava 1" }] },
    ])];
    const live = [cat("live-cat", "Krivično")];
    const r = buildTaxonomyRemap(parsed, live, "skip");

    expect(r.categoryRemap.get("b-cat")).toBe("live-cat");
    expect(r.subcategoryRemap.size).toBe(0);
    expect(r.chapterRemap.size).toBe(0);

    const merged = r.mergedCategories[0];
    expect(merged.id).toBe("live-cat");
    expect(merged.subcategories).toHaveLength(1);
    expect(merged.subcategories[0].id).toBe("b-sub");
    expect(merged.subcategories[0].chapters[0].id).toBe("b-ch");
    expect(r.categoriesToWrite).toHaveLength(1);
  });

  it("remaps subcategory + chapter when names collide with existing", () => {
    const parsed = [cat("b-cat", "Krivično", [
      {
        id: "b-sub",
        name: "Opšti dio",
        chapters: [{ id: "b-ch", name: "Glava 1" }, { id: "b-ch2", name: "Glava 2" }],
      },
    ])];
    const live = [cat("live-cat", "Krivično", [
      { id: "live-sub", name: "Opšti dio", chapters: [{ id: "live-ch", name: "Glava 1" }] },
    ])];
    const r = buildTaxonomyRemap(parsed, live, "newer");

    expect(r.categoryRemap.get("b-cat")).toBe("live-cat");
    expect(r.subcategoryRemap.get("b-sub")).toBe("live-sub");
    expect(r.chapterRemap.get("b-ch")).toBe("live-ch");
    // Glava 2 is novel → adopted, no remap entry
    expect(r.chapterRemap.has("b-ch2")).toBe(false);

    const sub = r.mergedCategories[0].subcategories[0];
    expect(sub.id).toBe("live-sub");
    expect(sub.chapters.map((c) => c.id).sort()).toEqual(["b-ch2", "live-ch"]);
  });

  it("adopts whole novel category when no existing name matches", () => {
    const parsed = [cat("b-cat", "Civilno", [{ id: "b-sub", name: "Stvarno pravo" }])];
    const live = [cat("live-cat", "Krivično")];
    const r = buildTaxonomyRemap(parsed, live, "keep");

    expect(r.categoryRemap.size).toBe(0);
    expect(r.mergedCategories).toHaveLength(2);
    expect(r.categoriesToWrite).toHaveLength(1);
    expect(r.categoriesToWrite[0].id).toBe("b-cat");
  });

  it("overwrite returns parsed as-is, empty remaps", () => {
    const parsed = [cat("b-cat", "Krivično")];
    const live = [cat("live-cat", "Krivično")];
    const r = buildTaxonomyRemap(parsed, live, "overwrite");

    expect(r.categoryRemap.size).toBe(0);
    expect(r.subcategoryRemap.size).toBe(0);
    expect(r.chapterRemap.size).toBe(0);
    expect(r.mergedCategories).toBe(parsed);
    expect(r.categoriesToWrite).toBe(parsed);
  });

  it("does not mutate input live categories (clone semantics)", () => {
    const parsed = [cat("b-cat", "Krivično", [{ id: "b-sub", name: "Novi dio" }])];
    const live = [cat("live-cat", "Krivično")];
    const liveSnapshot = JSON.parse(JSON.stringify(live));
    buildTaxonomyRemap(parsed, live, "skip");
    expect(live).toEqual(liveSnapshot);
  });
});

describe("applyTaxonomyRemap — card hierarchy rewrite", () => {
  it("rewrites card.categoryId, .subcategoryId, .chapterId in one pass", async () => {
    const parsed = [cat("b-cat", "Krivično", [
      { id: "b-sub", name: "Opšti dio", chapters: [{ id: "b-ch", name: "Glava 1" }] },
    ])];
    const live = [cat("live-cat", "Krivično", [
      { id: "live-sub", name: "Opšti dio", chapters: [{ id: "live-ch", name: "Glava 1" }] },
    ])];
    const remap = buildTaxonomyRemap(parsed, live, "skip");

    const c = card("c1", "b-cat", "b-sub", "b-ch");
    const map = { c1: c };
    await applyTaxonomyRemap(remap, emptyParsed(), [c], map);

    expect(c.categoryId).toBe("live-cat");
    expect(c.subcategoryId).toBe("live-sub");
    expect(c.chapterId).toBe("live-ch");
    expect(map.c1).toBe(c);
  });

  it("leaves adopted-novel subcategory cards untouched (UUIDs already valid)", async () => {
    const parsed = [cat("b-cat", "Krivično", [
      { id: "b-sub", name: "Novi dio", chapters: [{ id: "b-ch", name: "Glava 1" }] },
    ])];
    const live = [cat("live-cat", "Krivično")];
    const remap = buildTaxonomyRemap(parsed, live, "skip");

    const c = card("c1", "b-cat", "b-sub", "b-ch");
    await applyTaxonomyRemap(remap, emptyParsed(), [c], { c1: c });

    expect(c.categoryId).toBe("live-cat");
    expect(c.subcategoryId).toBe("b-sub"); // adopted UUID survives
    expect(c.chapterId).toBe("b-ch");
  });

  it("no-ops when all three remaps are empty", async () => {
    const parsed = emptyParsed();
    const c = card("c1", "x", "y", "z");
    await applyTaxonomyRemap(
      {
        categoryRemap: new Map(),
        subcategoryRemap: new Map(),
        chapterRemap: new Map(),
        mergedCategories: [],
        categoriesToWrite: [],
      },
      parsed,
      [c],
      { c1: c },
    );
    expect(c.categoryId).toBe("x");
    expect(c.subcategoryId).toBe("y");
    expect(c.chapterId).toBe("z");
  });
});
