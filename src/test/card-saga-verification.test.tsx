import { describe, it, expect } from "vitest";
import { cardRepository } from "@/lib/repositories";
import {
  countEndangeredEssaysAllFromDb,
  countEndangeredEssaysByCategoryFromDb,
} from "@/lib/db/queries";
import { aggregateSubjectProgress } from "@/lib/subject/aggregators";
import {
  buildSatellitesByParent,
  excludeNestedSatellitesFromLearnQueue,
} from "@/lib/saga/card-saga-grouping";
import {
  countEndangeredEssays,
  isEndangeredEssay,
} from "@/lib/saga/endangered-display";
import { EndangeredCountBadge } from "@/components/saga/CardMasteryStatusBadge";
import { render, screen } from "@testing-library/react";
import { makeCard } from "@/test/factories";

describe("card saga verification (step 7)", () => {
  describe("SQL endangered counts", () => {
    it("countEndangeredEssaysByCategoryFromDb counts only endangered essays in category", async () => {
      const essayOk = makeCard({
        id: "v-e1",
        categoryId: "cat-verify",
        type: "essay",
        isEndangered: false,
      });
      const essayBad = makeCard({
        id: "v-e2",
        categoryId: "cat-verify",
        type: "essay",
        isEndangered: true,
      });
      const flashBad = makeCard({
        id: "v-f1",
        categoryId: "cat-verify",
        type: "flash",
        isEndangered: true,
      });
      const otherCat = makeCard({
        id: "v-e3",
        categoryId: "cat-other",
        type: "essay",
        isEndangered: true,
      });

      await cardRepository.bulkPut([essayOk, essayBad, flashBad, otherCat]);

      await expect(countEndangeredEssaysByCategoryFromDb("cat-verify")).resolves.toBe(1);
      await expect(countEndangeredEssaysByCategoryFromDb("cat-missing")).resolves.toBe(0);
    });

    it("countEndangeredEssaysAllFromDb sums across categories", async () => {
      const a = makeCard({
        id: "v-all-1",
        categoryId: "cat-a",
        type: "essay",
        isEndangered: true,
      });
      const b = makeCard({
        id: "v-all-2",
        categoryId: "cat-b",
        type: "essay",
        isEndangered: true,
      });
      const c = makeCard({
        id: "v-all-3",
        categoryId: "cat-a",
        type: "essay",
        isEndangered: false,
      });

      await cardRepository.bulkPut([a, b, c]);

      const total = await countEndangeredEssaysAllFromDb();
      expect(total).toBe(2);
    });
  });

  describe("subject progress aggregator", () => {
    it("aggregateSubjectProgress rolls up endangeredCount per subcategory and chapter", () => {
      const subId = "sub-v1";
      const chId = "ch-v1";
      const cards = [
        makeCard({
          id: "agg-e1",
          categoryId: "cat-agg",
          subcategoryId: subId,
          chapterId: chId,
          type: "essay",
          isEndangered: true,
        }),
        makeCard({
          id: "agg-e2",
          categoryId: "cat-agg",
          subcategoryId: subId,
          chapterId: chId,
          type: "essay",
          isEndangered: false,
        }),
        makeCard({
          id: "agg-f1",
          categoryId: "cat-agg",
          subcategoryId: subId,
          type: "flash",
          isEndangered: true,
        }),
      ];

      const result = aggregateSubjectProgress(cards, [
        { id: subId, name: "Potkategorija", chapters: [{ id: chId, name: "Glava" }] },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]?.endangeredCount).toBe(1);
      expect(result[0]?.chapters[0]?.endangeredCount).toBe(1);
    });
  });

  describe("learn / passive reader queue helpers", () => {
    it("buildSatellitesByParent matches groupCardsForSagaDisplay map", () => {
      const essay = makeCard({ id: "bv-e1", type: "essay" });
      const flash = makeCard({ id: "bv-f1", type: "flash", parentId: "bv-e1" });
      const map = buildSatellitesByParent([essay, flash]);
      expect(map.get("bv-e1")?.map((c) => c.id)).toEqual(["bv-f1"]);
    });

    it("excludeNestedSatellitesFromLearnQueue preserves orphan satellites", () => {
      const essay = makeCard({ id: "q-e1", type: "essay" });
      const nested = makeCard({ id: "q-f1", type: "flash", parentId: "q-e1" });
      const orphan = makeCard({ id: "q-f2", type: "flash", parentId: "missing-parent" });

      const queue = excludeNestedSatellitesFromLearnQueue([essay, nested, orphan]);
      expect(queue.map((c) => c.id)).toEqual(["q-e1", "q-f2"]);
    });
  });

  describe("endangered display helpers", () => {
    it("countEndangeredEssays ignores non-essay cards", () => {
      const cards = [
        makeCard({ type: "essay", isEndangered: true }),
        makeCard({ type: "flash", isEndangered: true }),
        makeCard({ type: "essay", isEndangered: false }),
      ];
      expect(countEndangeredEssays(cards)).toBe(1);
      expect(isEndangeredEssay(cards[1]!)).toBe(false);
    });
  });

  describe("EndangeredCountBadge", () => {
    it("renders nothing when count is zero", () => {
      const { container } = render(<EndangeredCountBadge count={0} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders count when endangered essays exist", () => {
      render(<EndangeredCountBadge count={3} />);
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });
});
