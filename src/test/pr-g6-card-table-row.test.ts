/**
 * PR-G6 / RC-6 — render discipline for `CardViewTable`.
 *
 * Guards:
 *  1. `CardTableRow` is wrapped in `React.memo`.
 *  2. `CardViewTable.tsx` no longer contains the inline per-row
 *     `allCategories.find(...)` / `.flatMap(...).find(...)` taxonomy
 *     IIFEs — those are now hoisted into one `useMemo` over
 *     `subNameById` + `chapNameById` lookup maps.
 *  3. `CardViewTable.tsx` renders `<CardTableRow />` instead of an inline
 *     `<div>` row body inside `filteredCards.map(...)`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CardTableRow } from "@/components/category/CardTableRow";

const REACT_MEMO = Symbol.for("react.memo");

describe("PR-G6 — CardViewTable render discipline", () => {
  it("CardTableRow is wrapped in React.memo", () => {
    expect((CardTableRow as { $$typeof?: symbol }).$$typeof).toBe(REACT_MEMO);
  });

  it("CardViewTable hoists taxonomy lookups out of per-row IIFEs", () => {
    const file = readFileSync(
      resolve(process.cwd(), "src/components/category/CardViewTable.tsx"),
      "utf8",
    );
    // Strip comments so doc/explanatory mentions don't false-positive.
    const code = file
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // The hot-path patterns we are guarding against:
    expect(code).not.toMatch(/allCategories\.find\(/);
    expect(code).not.toMatch(/\.subcategories\?\.flatMap\(/);
    // Sanity — confirm the new lookup maps are present.
    expect(code).toMatch(/subNameById/);
    expect(code).toMatch(/chapNameById/);
  });

  it("CardViewTable delegates row rendering to <CardTableRow />", () => {
    const file = readFileSync(
      resolve(process.cwd(), "src/components/category/CardViewTable.tsx"),
      "utf8",
    );
    expect(file).toMatch(/<CardTableRow\b/);
    expect(file).toMatch(/import\s*\{[^}]*CardTableRow[^}]*\}\s*from\s*["']\.\/CardTableRow["']/);
  });
});
