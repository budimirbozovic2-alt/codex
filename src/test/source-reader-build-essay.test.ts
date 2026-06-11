import { describe, it, expect } from "vitest";
import {
  buildSeparateEssaysFromModules,
  buildCombinedEssayFromModules,
  buildEssayFromSelection,
  buildLinkPatch,
} from "@/lib/source-reader/build-essay-payload";
import type { SelectionModule } from "@/lib/selection-split-engine";
import type { WizardModuleEdit } from "@/lib/split-wizard-build";
import type { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/domains/sources/sources-storage";

const mod = (n: string, title: string, body = "Sadržaj"): SelectionModule => ({
  articleNum: n,
  title,
  contentText: body,
  contentHtml: `<p>${body}</p>`,
  plainSnippet: `Član ${n}\n${body}`,
});
const edit = (question?: string, tags: string[] = [], skipped = false): WizardModuleEdit => ({
  question: question ?? "", tags, skipped,
});

const fakeSource = (): Source => ({
  id: "s1", title: "Test", categoryId: "cat-1",
  htmlContent: "", outline: [], articles: [], examQuestions: [],
  createdAt: 0, updatedAt: 0,
} as unknown as Source);

describe("source-reader build-essay-payload", () => {
  describe("buildSeparateEssaysFromModules", () => {
    it("emits one AddCardArgs per non-skipped module", () => {
      const mods = [mod("1", "A"), mod("2", "B")];
      const args = buildSeparateEssaysFromModules(mods, [edit("A"), edit("B")], fakeSource());
      expect(args).toHaveLength(2);
      expect(args[0].question).toBe("A");
      expect(args[0].sections[0].title).toBe("Odgovor");
      expect(args[0].options?.sourceId).toBe("s1");
      expect(args[0].options?.textAnchor).toBeTruthy();
    });

    it("skips edits flagged as skipped", () => {
      const mods = [mod("1", "A"), mod("2", "B")];
      const args = buildSeparateEssaysFromModules(mods, [edit("A"), edit("B", [], true)], fakeSource());
      expect(args).toHaveLength(1);
      expect(args[0].question).toBe("A");
    });
  });

  describe("buildCombinedEssayFromModules", () => {
    it("returns a single AddCardArgs with N sections + sourceModules", () => {
      const mods = [mod("1", "A"), mod("2", "B")];
      const args = buildCombinedEssayFromModules(mods, [edit("A"), edit("B")], "Parent", fakeSource());
      expect(args).not.toBeNull();
      expect(args!.question).toBe("Parent");
      expect(args!.sections).toHaveLength(2);
      expect(args!.options?.sourceModules).toHaveLength(2);
      expect(args!.options?.childCardIds).toEqual(args!.options?.sourceModules?.map((m) => m.id));
    });

    it("returns null when every module is skipped", () => {
      const mods = [mod("1", "A")];
      const args = buildCombinedEssayFromModules(mods, [edit("A", [], true)], "X", fakeSource());
      expect(args).toBeNull();
    });
  });

  describe("buildEssayFromSelection (exam mapping)", () => {
    it("falls back to single-section when no Član boundaries detected", () => {
      const r = buildEssayFromSelection("kratak tekst bez članova", "<p>x</p>", "Q1?", fakeSource());
      expect(r.moduleCount).toBe(1);
      expect(r.args.sections).toHaveLength(1);
      expect(r.args.question).toBe("Q1?");
    });

    it("splits into multiple sections when Član boundaries are present", () => {
      const sel = "Naslov 1\nČlan 1\nSadržaj jedan.\nNaslov 2\nČlan 2\nSadržaj dva.";
      const r = buildEssayFromSelection(sel, "", "Pitanje?", fakeSource());
      expect(r.moduleCount).toBeGreaterThanOrEqual(2);
      expect(r.args.options?.sourceModules?.length).toBe(r.moduleCount);
      expect(r.rangeLabel).toBeTruthy();
    });
  });

  describe("buildLinkPatch", () => {
    const card: Card = {
      id: "c1", question: "Q", categoryId: "cat-1",
      sections: [{ title: "Postojeća", content: "<p>old</p>" }],
    } as unknown as Card;

    it("appends a snippet section by default", () => {
      const patched = buildLinkPatch(card, "snippet text", "<p>snippet</p>", "src-1", true);
      expect(patched.sourceId).toBe("src-1");
      expect(patched.sections).toHaveLength(2);
      expect(patched.sections[1].title).toBe("Isječak iz izvora");
    });

    it("does not append when appendSnippet=false", () => {
      const patched = buildLinkPatch(card, "snippet", "", "src-1", false);
      expect(patched.sections).toHaveLength(1);
      expect(patched.sourceId).toBe("src-1");
      expect(patched.textAnchor).toBeTruthy();
    });
  });
});
