import { describe, it, expect } from "vitest";
import {
  stripHtmlText,
  normalizeMatchText,
  collectSourceCoverageModules,
} from "@/lib/source-coverage";
import type { Card } from "@/lib/spaced-repetition";

// ─── stripHtmlText ───────────────────────────────────────

describe("stripHtmlText", () => {
  it("removes HTML tags", () => {
    expect(stripHtmlText("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("decodes &nbsp;", () => {
    expect(stripHtmlText("foo&nbsp;bar")).toBe("foo bar");
  });

  it("decodes &amp; &lt; &gt; &quot; &#39;", () => {
    expect(stripHtmlText("&amp; &lt; &gt; &quot; &#39;")).toBe('& < > " \'');
  });

  it("collapses whitespace", () => {
    expect(stripHtmlText("  foo   bar  ")).toBe("foo bar");
  });

  it("handles empty string", () => {
    expect(stripHtmlText("")).toBe("");
  });
});

// ─── normalizeMatchText ──────────────────────────────────

describe("normalizeMatchText", () => {
  it("lowercases and trims", () => {
    expect(normalizeMatchText("  Hello WORLD  ")).toBe("hello world");
  });

  it("strips HTML before normalizing", () => {
    expect(normalizeMatchText("<b>Test</b>")).toBe("test");
  });
});

// ─── collectSourceCoverageModules ────────────────────────

describe("collectSourceCoverageModules", () => {
  const baseCard: Card = {
    id: "card-1",
    question: "What is X?",
    sections: [],
    categoryId: "cat-1",
    createdAt: Date.now(),
    readCount: 0,
    type: "essay",
    sourceId: "src-1",
    originalSourceSnippet: "This is a long enough snippet for matching purposes",
  };

  it("filters by sourceId", () => {
    const cards: Card[] = [
      { ...baseCard, id: "c1", sourceId: "src-1" },
      { ...baseCard, id: "c2", sourceId: "src-2" },
    ];
    const modules = collectSourceCoverageModules(cards, "src-1");
    expect(modules).toHaveLength(1);
    expect(modules[0].cardId).toBe("c1");
  });

  it("uses sourceModules when present", () => {
    const card: Card = {
      ...baseCard,
      sourceModules: [
        { id: "m1", order: 0, title: "Module 1", question: "Q1", textAnchor: "", originalSourceSnippet: "A long enough source snippet text here" },
      ],
    };
    const modules = collectSourceCoverageModules([card], "src-1");
    expect(modules).toHaveLength(1);
    expect(modules[0].id).toBe("m1");
    expect(modules[0].title).toBe("Module 1");
  });

  it("falls back to card-level snippet", () => {
    const modules = collectSourceCoverageModules([baseCard], "src-1");
    expect(modules).toHaveLength(1);
    expect(modules[0].snippet).toBe(baseCard.originalSourceSnippet);
  });

  it("rejects snippets shorter than 10 chars", () => {
    const card: Card = { ...baseCard, originalSourceSnippet: "short" };
    const modules = collectSourceCoverageModules([card], "src-1");
    expect(modules).toHaveLength(0);
  });

  it("returns empty for no matching sourceId", () => {
    expect(collectSourceCoverageModules([baseCard], "nonexistent")).toHaveLength(0);
  });
});
