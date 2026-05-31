/**
 * PR-G5 follow-up — DnD virtualization regression.
 *
 * Verifies:
 *  1. `VirtualSortableCardList` exists, is memoized, and exports a sane
 *     `VIRTUALIZATION_THRESHOLD`.
 *  2. `OrgSubcategoryPanel.tsx` wires the virtualization fallback for
 *     chapters that exceed the threshold (`ch.cards.length > VIRTUALIZATION_THRESHOLD`).
 *  3. `VirtualSortableCardList` does NOT nest a second `<SortableContext>`
 *     — duplicating the sortable scope confuses dnd-kit index resolution.
 *     The outer `<SortableContext>` in `OrgSubcategoryPanel` is the SSOT.
 *  4. The `<DragOverlay>` shim is still rendered at `document.body` in
 *     `CardOrgMode.tsx`, so the drag ghost survives source-row unmounting
 *     by the virtualizer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VirtualSortableCardList,
  VIRTUALIZATION_THRESHOLD,
} from "@/components/category/org-mode/VirtualSortableCardList";

const REACT_MEMO = Symbol.for("react.memo");

describe("PR-G5 — DnD virtualization", () => {
  it("VirtualSortableCardList is memoized", () => {
    expect((VirtualSortableCardList as { $$typeof?: symbol }).$$typeof).toBe(REACT_MEMO);
  });

  it("VIRTUALIZATION_THRESHOLD is a positive integer", () => {
    expect(Number.isInteger(VIRTUALIZATION_THRESHOLD)).toBe(true);
    expect(VIRTUALIZATION_THRESHOLD).toBeGreaterThan(0);
  });

  it("OrgSubcategoryPanel switches to VirtualSortableCardList above threshold", () => {
    const file = readFileSync(
      resolve(process.cwd(), "src/components/category/org-mode/OrgSubcategoryPanel.tsx"),
      "utf8",
    );
    expect(file).toMatch(/import\s*\{[^}]*VirtualSortableCardList[^}]*\}\s*from\s*["']\.\/VirtualSortableCardList["']/);
    expect(file).toMatch(/ch\.cards\.length\s*>\s*VIRTUALIZATION_THRESHOLD/);
    expect(file).toMatch(/<VirtualSortableCardList\s+cards=\{ch\.cards\}\s*\/>/);
  });

  it("VirtualSortableCardList does NOT nest a second SortableContext (single SSOT in parent)", () => {
    const file = readFileSync(
      resolve(process.cwd(), "src/components/category/org-mode/VirtualSortableCardList.tsx"),
      "utf8",
    );
    expect(file).not.toMatch(/<SortableContext\b/);
    expect(file).not.toMatch(/from\s+["']@dnd-kit\/sortable["']/);
  });

  it("CardOrgMode still mounts <DragOverlay> via document.body portal (overlay shim)", () => {
    const file = readFileSync(
      resolve(process.cwd(), "src/components/category/CardOrgMode.tsx"),
      "utf8",
    );
    expect(file).toMatch(/createPortal\s*\(/);
    expect(file).toMatch(/<DragOverlay\b/);
    expect(file).toMatch(/document\.body/);
  });
});
