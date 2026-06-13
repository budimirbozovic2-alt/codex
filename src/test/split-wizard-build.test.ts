import { describe, it, expect } from "vitest";
import {
  defaultEdit,
  buildSeparatePlans,
  buildCombinedPlan,
  unfinishedIndices,
} from "@/lib/split-wizard-build";
import type { SelectionModule } from "@/lib/selection-split-engine";

const M = (n: string, title: string, body = `body-${n}`): SelectionModule => ({
  id: `mod-${n}`,
  articleNum: n,
  title,
  contentText: body,
  contentHtml: `<p>${body}</p>`,
  plainSnippet: `Član ${n}\n${body}`,
});

const MODS: SelectionModule[] = [
  M("59", "čl. 59 Pojam podnesaka"),
  M("60", "čl. 60 Neuredan podnesak"),
  M("61", "čl. 61 Predaja podnesaka"),
];

describe("Split Wizard — defaultEdit", () => {
  it("seeds question from module title and zero tags / not skipped", () => {
    const e = defaultEdit(MODS[0]);
    expect(e.question).toBe("čl. 59 Pojam podnesaka");
    expect(e.tags).toEqual([]);
    expect(e.skipped).toBe(false);
  });
});

describe("Split Wizard — buildSeparatePlans", () => {
  it("produces one plan per non-skipped module preserving order", () => {
    const edits = MODS.map(defaultEdit);
    const plans = buildSeparatePlans(MODS, edits);
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.module.articleNum)).toEqual(["59", "60", "61"]);
  });

  it("excludes skipped modules", () => {
    const edits = MODS.map(defaultEdit);
    edits[1].skipped = true;
    const plans = buildSeparatePlans(MODS, edits);
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.module.articleNum)).toEqual(["59", "61"]);
  });

  it("uses overridden question and falls back to title when blank", () => {
    const edits = MODS.map(defaultEdit);
    edits[0].question = "  Šta je podnesak?  ";
    edits[1].question = "   "; // blank → fallback
    const plans = buildSeparatePlans(MODS, edits);
    expect(plans[0].question).toBe("Šta je podnesak?");
    expect(plans[1].question).toBe("čl. 60 Neuredan podnesak");
  });

  it("normalizes and dedupes tags per plan", () => {
    const edits = MODS.map(defaultEdit);
    edits[0].tags = ["#Načelo", "načelo", " Procesno Pravo "];
    const plans = buildSeparatePlans(MODS, edits);
    expect(plans[0].tags).toEqual(["načelo", "procesno-pravo"]);
  });
});

describe("Split Wizard — buildCombinedPlan", () => {
  it("creates one plan with N section-modules and union of tags", () => {
    const edits = MODS.map(defaultEdit);
    edits[0].tags = ["upravni-postupak"];
    edits[2].tags = ["upravni-postupak", "predaja"];
    const plan = buildCombinedPlan(MODS, edits, "Sve o podnescima");
    expect(plan).not.toBeNull();
    expect(plan!.parentName).toBe("Sve o podnescima");
    expect(plan!.modules).toHaveLength(3);
    // Union, deduped:
    expect(plan!.tags.sort()).toEqual(["predaja", "upravni-postupak"]);
  });

  it("excludes skipped modules from the combined plan", () => {
    const edits = MODS.map(defaultEdit);
    edits[1].skipped = true;
    const plan = buildCombinedPlan(MODS, edits, "Test");
    expect(plan!.modules).toHaveLength(2);
    expect(plan!.modules[0].module.articleNum).toBe("59");
    expect(plan!.modules[1].module.articleNum).toBe("61");
  });

  it("returns null when every module is skipped", () => {
    const edits = MODS.map((m) => ({ ...defaultEdit(m), skipped: true }));
    expect(buildCombinedPlan(MODS, edits, "x")).toBeNull();
  });

  it("falls back to default parentName when blank", () => {
    const plan = buildCombinedPlan(MODS, MODS.map(defaultEdit), "   ");
    expect(plan!.parentName).toBe("Esej");
  });

  it("preserves overridden module question as section title", () => {
    const edits = MODS.map(defaultEdit);
    edits[0].question = "Definicija podneska";
    const plan = buildCombinedPlan(MODS, edits, "P");
    expect(plan!.modules[0].question).toBe("Definicija podneska");
  });
});

describe("Split Wizard — unfinishedIndices", () => {
  it("flags modules where question still equals the auto-title", () => {
    const edits = MODS.map(defaultEdit);
    edits[1].question = "Custom pitanje";
    const idx = unfinishedIndices(MODS, edits);
    expect(idx).toEqual([0, 2]);
  });

  it("ignores skipped modules", () => {
    const edits = MODS.map(defaultEdit);
    edits[0].skipped = true;
    const idx = unfinishedIndices(MODS, edits);
    expect(idx).toEqual([1, 2]);
  });

  it("returns empty when every module has been personalized", () => {
    const edits = MODS.map((m) => ({ ...defaultEdit(m), question: `Q-${m.articleNum}` }));
    expect(unfinishedIndices(MODS, edits)).toEqual([]);
  });
});
