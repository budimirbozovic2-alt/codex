/**
 * PR-G5 / RC-5: Render discipline regression.
 *
 * Verifies that:
 *  (a) `OrgSubcategoryPanel` is wrapped in `React.memo` (identity check + name).
 *  (b) `UnassignedCardRow` is wrapped in `React.memo`.
 *  (c) `DroppableChapterZone` is wrapped in `React.memo`.
 *  (d) Static guard — `OrgSubcategoryPanel.tsx` does NOT rebuild
 *      `availableChapters` / `chapterIdMap` / `subIdMap` / `otherSubs` inside
 *      the `node.unassigned.map(...)` callback (which would re-allocate per
 *      row on every pointer-move during DnD).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OrgSubcategoryPanel } from "@/components/category/org-mode/OrgSubcategoryPanel";
import {
  DroppableChapterZone,
  UnassignedCardRow,
  SortableCardTile,
} from "@/components/category/org-mode/OrgCardTiles";

// React memo wraps return an object with `$$typeof === Symbol.for("react.memo")`.
const REACT_MEMO = Symbol.for("react.memo");

function isMemo(C: unknown): boolean {
  return !!C && typeof C === "object" && (C as { $$typeof?: symbol }).$$typeof === REACT_MEMO;
}

describe("PR-G5 — org-mode render discipline", () => {
  it("OrgSubcategoryPanel is wrapped in React.memo", () => {
    expect(isMemo(OrgSubcategoryPanel)).toBe(true);
  });

  it("DroppableChapterZone is wrapped in React.memo", () => {
    expect(isMemo(DroppableChapterZone)).toBe(true);
  });

  it("UnassignedCardRow is wrapped in React.memo", () => {
    expect(isMemo(UnassignedCardRow)).toBe(true);
  });

  it("SortableCardTile remains memoized (pre-existing PR-G6 guard)", () => {
    expect(isMemo(SortableCardTile)).toBe(true);
  });

  it("OrgSubcategoryPanel does NOT rebuild lookup maps inside unassigned.map()", () => {
    const file = readFileSync(
      resolve(process.cwd(), "src/components/category/org-mode/OrgSubcategoryPanel.tsx"),
      "utf8",
    );

    // Find the start of the unassigned `.map(` callback body and inspect what
    // comes inside it. The regression we are guarding against is in-callback
    // `const availableChapters = node.chapters.map(...)` etc.
    const start = file.indexOf("node.unassigned.map(");
    expect(start).toBeGreaterThan(-1);

    // Slice the next ~1200 chars — enough to cover the row callback.
    const slice = file.slice(start, start + 1400);

    expect(slice).not.toMatch(/const\s+availableChapters\s*=\s*node\.chapters\.map/);
    expect(slice).not.toMatch(/const\s+chapterIdMap\s*=\s*new\s+Map\(node\.chapters/);
    expect(slice).not.toMatch(/const\s+otherSubs\s*=\s*tree\s*\.filter/);
    expect(slice).not.toMatch(/const\s+subIdMap\s*=\s*new\s+Map\(tree\.map/);
  });
});
