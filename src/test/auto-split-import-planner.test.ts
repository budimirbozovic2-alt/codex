import { describe, it, expect } from "vitest";
import {
  buildArticleRows, mergeRows, ungroupRow, buildImportPlan,
  type ArticleRow,
} from "@/lib/auto-split/import-planner";
import type { DetectedArticle } from "@/lib/auto-split-engine";
import type { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/db-types";
import { makeSource, makeCard } from "./factories";

const art = (num: string, title = ""): DetectedArticle => ({
  articleNum: num,
  title,
  autoTitle: !title,
  essayName: title ? `Čl. ${num} ${title}` : `Čl. ${num}`,
  contentHtml: `<p>Sadržaj člana ${num}.</p>`,
  plainSnippet: `Član ${num}\nSadržaj člana ${num}.`,
});

const fakeSource = (): Source =>
  makeSource({
    id: "src-1",
    title: "Test Zakon",
    categoryId: "cat-1",
    html: "",
    examQuestions: [],
    createdAt: 0,
    updatedAt: 0,
  });

const cardWith = (id: string, question: string, sourceId: string): Card =>
  makeCard({ id, question, sourceId, categoryId: "cat-1", sections: [] });

describe("auto-split import-planner", () => {
  describe("buildArticleRows", () => {
    it("marks articles without existing card as new+selected", () => {
      const rows = buildArticleRows([art("1"), art("2")], []);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "new" && r.selected)).toBe(true);
    });

    it("matches existing cards by 'čl. N ' prefix and unselects them", () => {
      const cards = [cardWith("c1", "Čl. 1 nešto", "src-1")];
      const rows = buildArticleRows([art("1"), art("2")], cards);
      expect(rows[0].status).toBe("exists");
      expect(rows[0].existingCardId).toBe("c1");
      expect(rows[0].selected).toBe(false);
      expect(rows[1].status).toBe("new");
    });
  });

  describe("mergeRows / ungroupRow", () => {
    it("merges two adjacent rows into a group at the first index", () => {
      const initial = buildArticleRows([art("1"), art("2"), art("3")], []);
      const merged = mergeRows(initial, [0, 1], "Spoj 1+2");
      expect(merged).toHaveLength(2);
      expect(merged[0].isGroup).toBe(true);
      expect(merged[0].articles.map((a) => a.articleNum)).toEqual(["1", "2"]);
      expect(merged[0].essayName).toBe("Spoj 1+2");
      expect(merged[1].articles[0].articleNum).toBe("3");
    });

    it("ignores merge when fewer than 2 indices supplied", () => {
      const initial = buildArticleRows([art("1"), art("2")], []);
      expect(mergeRows(initial, [0], "x")).toHaveLength(2);
    });

    it("ungroup expands a merged row back into singles", () => {
      const initial = buildArticleRows([art("1"), art("2"), art("3")], []);
      const merged = mergeRows(initial, [0, 1], "Spoj");
      const back = ungroupRow(merged, 0);
      expect(back).toHaveLength(3);
      expect(back[0].isGroup).toBe(false);
      expect(back[0].articles[0].articleNum).toBe("1");
      expect(back[1].articles[0].articleNum).toBe("2");
    });
  });

  describe("buildImportPlan", () => {
    it("creates fresh cards for selected new rows", () => {
      const rows = buildArticleRows([art("1"), art("2")], []);
      const plan = buildImportPlan(rows, fakeSource());
      expect(plan.toCreate).toHaveLength(2);
      expect(plan.toUpdate).toHaveLength(0);
      expect(plan.toCreate[0].sourceId).toBe("src-1");
      expect(plan.toCreate[0].textAnchor).toBeTruthy();
    });

    it("emits update patches for existing rows (when selected)", () => {
      const cards = [cardWith("c1", "Čl. 1 nešto", "src-1")];
      let rows = buildArticleRows([art("1")], cards);
      rows = rows.map((r) => ({ ...r, selected: true })) as ArticleRow[];
      const plan = buildImportPlan(rows, fakeSource());
      expect(plan.toCreate).toHaveLength(0);
      expect(plan.toUpdate).toHaveLength(1);
      expect(plan.toUpdate[0].id).toBe("c1");
      expect(plan.toUpdate[0].patch.sourceId).toBe("src-1");
    });

    it("merged group becomes a single card with sourceModules + childCardIds", () => {
      const initial = buildArticleRows([art("1"), art("2")], []);
      const merged = mergeRows(initial, [0, 1], "Grupa");
      const plan = buildImportPlan(merged, fakeSource());
      expect(plan.toCreate).toHaveLength(1);
      const c = plan.toCreate[0];
      expect(c.sourceModules).toHaveLength(2);
      expect(c.childCardIds).toHaveLength(2);
      expect(c.childCardIds).toEqual(c.sourceModules?.map((m) => m.id));
    });

    it("skips deselected rows", () => {
      const rows = buildArticleRows([art("1"), art("2")], []).map((r, i) => ({
        ...r, selected: i === 0,
      }));
      const plan = buildImportPlan(rows, fakeSource());
      expect(plan.toCreate).toHaveLength(1);
    });
  });
});
