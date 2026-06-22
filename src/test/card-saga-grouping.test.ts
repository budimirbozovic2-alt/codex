import { describe, it, expect } from "vitest";
import {
  groupCardsForSagaDisplay,
  groupChapterCardsForOrg,
  isFlashSatellite,
  findOrphanSatellites,
  excludeNestedSatellitesFromLearnQueue,
  excludeBurySagaSiblings,
} from "@/lib/saga/card-saga-grouping";
import { makeCard } from "@/test/factories";

describe("card-saga-grouping", () => {
  it("isFlashSatellite detects linked flash cards", () => {
    expect(isFlashSatellite(makeCard({ type: "flash", parentId: "e1" }))).toBe(true);
    expect(isFlashSatellite(makeCard({ type: "flash" }))).toBe(false);
    expect(isFlashSatellite(makeCard({ type: "essay" }))).toBe(false);
  });

  it("nests satellites under parent essay in top-level list", () => {
    const essay = makeCard({ id: "e1", type: "essay" });
    const flash = makeCard({ id: "f1", type: "flash", parentId: "e1" });
    const solo = makeCard({ id: "f2", type: "flash" });

    const { topLevelCards, satellitesByParent } = groupCardsForSagaDisplay([
      essay, flash, solo,
    ]);

    expect(topLevelCards.map(c => c.id)).toEqual(["e1", "f2"]);
    expect(satellitesByParent.get("e1")?.map(c => c.id)).toEqual(["f1"]);
  });

  it("shows orphaned satellite when parent not in filtered set", () => {
    const flash = makeCard({ id: "f1", type: "flash", parentId: "missing" });
    const { topLevelCards, satellitesByParent } = groupCardsForSagaDisplay([flash]);
    expect(topLevelCards).toHaveLength(1);
    expect(satellitesByParent.size).toBe(0);
  });

  it("groupChapterCardsForOrg attaches satellites to essay in chapter", () => {
    const essay = makeCard({ id: "e1", type: "essay" });
    const flash = makeCard({ id: "f1", type: "flash", parentId: "e1" });
    const groups = groupChapterCardsForOrg([essay], [essay, flash]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.satellites.map(c => c.id)).toEqual(["f1"]);
  });

  it("groupChapterCardsForOrg omits satellites from standalone chapter rows", () => {
    const essay = makeCard({ id: "e1", type: "essay" });
    const flash = makeCard({ id: "f1", type: "flash", parentId: "e1" });
    const groups = groupChapterCardsForOrg([essay, flash], [essay, flash]);
    expect(groups.map((g) => g.card.id)).toEqual(["e1"]);
  });

  it("excludeNestedSatellitesFromLearnQueue drops linked flashes when parent is queued", () => {
    const essay = makeCard({ id: "e1", type: "essay" });
    const flash = makeCard({ id: "f1", type: "flash", parentId: "e1" });
    const orphan = makeCard({ id: "f2", type: "flash", parentId: "missing" });

    const queue = excludeNestedSatellitesFromLearnQueue([essay, flash, orphan]);
    expect(queue.map(c => c.id)).toEqual(["e1", "f2"]);
  });

  it("excludeBurySagaSiblings drops satellite items when parent essay is in the same list", () => {
    const essay = makeCard({ id: "e1", type: "essay" });
    const flash = makeCard({ id: "f1", type: "flash", parentId: "e1" });
    const orphan = makeCard({ id: "f2", type: "flash", parentId: "missing" });

    const items = [
      { card: essay, sectionId: "s1" },
      { card: flash, sectionId: "s2" },
      { card: orphan, sectionId: "s3" },
    ];
    const buried = excludeBurySagaSiblings(items);
    expect(buried.map((i) => i.card.id)).toEqual(["e1", "f2"]);
  });

  it("findOrphanSatellites returns satellites whose parent is missing", () => {
    const essay = makeCard({ id: "e1", type: "essay" });
    const linked = makeCard({ id: "f1", type: "flash", parentId: "e1" });
    const orphan = makeCard({ id: "f2", type: "flash", parentId: "missing" });
    const solo = makeCard({ id: "f3", type: "flash" });

    expect(findOrphanSatellites([essay, linked, orphan, solo]).map((c) => c.id)).toEqual([
      "f2",
    ]);
  });
});
