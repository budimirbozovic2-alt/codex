/**
 * Contract test for src/views/CategoryView.tsx
 *
 * Architectural decision (mem://architecture/knowledge-map-restructuring):
 *   `CategoryView` MUST render only `SourcesTab`. The "Mapa znanja"
 *   (knowledge map) and "Struktura" (structure) features have been moved
 *   to `SubjectDashboard` / `SubjectCardsView` and must never reappear here.
 *
 * Rather than mounting CategoryView (which drags in Dexie, card hooks, and
 * react-router), we statically inspect the source. This is fast, deterministic,
 * and catches regressions at the import/JSX layer — exactly where they would
 * be reintroduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(
  resolve(__dirname, "../views/CategoryView.tsx"),
  "utf8",
);

// Strip comments so prose like "Mapa znanja & Struktura moved to ..." doesn't
// trigger false positives when scanning JSX/imports.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (skip URLs like https://)
}

const CODE = stripComments(SOURCE);

// ── Forbidden modules: any of these means Mapa znanja / Struktura is back.
const FORBIDDEN_IMPORTS = [
  "MindMap",          // catches MindMapViewer, MindMapTab, EmbeddedMindMap, MindMapsTab, …
  "MentalSkeleton",   // structure visualizer
  "StructureManager", // structure editor
  "StructureTab",
  "KnowledgeMap",
  "MapaZnanja",
];

// ── Forbidden JSX tags (defence in depth in case someone aliases an import).
const FORBIDDEN_JSX: ReadonlyArray<readonly [string, RegExp]> = [
  ["MindMap*", /<MindMap[A-Za-z]*[\s/>]/],
  ["MentalSkeleton*", /<MentalSkeleton[A-Za-z]*[\s/>]/],
  ["Structure*", /<Structure[A-Za-z]*[\s/>]/],
  ["KnowledgeMap*", /<KnowledgeMap[A-Za-z]*[\s/>]/],
];

describe("CategoryView contract", () => {
  it("imports SourcesTab from the canonical path", () => {
    expect(CODE).toMatch(
      /import\s+SourcesTab\s+from\s+["']@\/components\/category\/SourcesTab["']/,
    );
  });

  it("renders <SourcesTab /> in JSX", () => {
    expect(CODE).toMatch(/<SourcesTab[\s/>]/);
  });

  it.each(FORBIDDEN_IMPORTS)(
    "does NOT import anything matching %s",
    (needle) => {
      const importLines = CODE
        .split("\n")
        .filter((l) => /^\s*import\s/.test(l))
        .join("\n");
      expect(importLines).not.toMatch(new RegExp(needle));
    },
  );

  it.each(FORBIDDEN_JSX)("does NOT render JSX matching %s", (_label, re) => {
    expect(CODE).not.toMatch(re);
  });

  it("renders exactly one *Tab JSX element, and it is SourcesTab", () => {
    const tabMatches = CODE.match(/<[A-Z][A-Za-z]*Tab[\s/>]/g) ?? [];
    expect(tabMatches.length).toBe(1);
    expect(tabMatches[0]).toMatch(/SourcesTab/);
  });

  it("does NOT load full cards[] only for mastery bar (TD-2)", () => {
    expect(CODE).not.toMatch(/useCardsByCategoryWithStatus/);
    expect(CODE).toMatch(/useMasteryDistributionByCategory/);
  });
});
