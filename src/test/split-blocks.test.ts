import { describe, it, expect } from "vitest";
import {
  splitDocByTopLevelBlocks,
  joinTopLevelBlocks,
  sliceDocAtBlock,
  blockPlainText,
} from "@/lib/editor-v4/split-blocks";
import type { EditorDoc } from "@/lib/editor-v4/types";

const make = (...paragraphs: string[]): EditorDoc => ({
  version: 4,
  content: {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    })),
  },
});

describe("split-blocks", () => {
  it("splits into one doc per top-level block", () => {
    const doc = make("a", "b", "c");
    const parts = splitDocByTopLevelBlocks(doc);
    expect(parts).toHaveLength(3);
    expect(blockPlainText(parts[1])).toBe("b");
  });

  it("join is inverse of split", () => {
    const doc = make("x", "y", "z");
    const re = joinTopLevelBlocks(splitDocByTopLevelBlocks(doc));
    expect(re).toEqual(doc);
  });

  it("sliceDocAtBlock partitions at the boundary", () => {
    const doc = make("a", "b", "c", "d");
    const { before, after } = sliceDocAtBlock(doc, 2);
    expect(splitDocByTopLevelBlocks(before).map(blockPlainText)).toEqual(["a", "b"]);
    expect(splitDocByTopLevelBlocks(after).map(blockPlainText)).toEqual(["c", "d"]);
  });

  it("handles empty/null docs", () => {
    expect(splitDocByTopLevelBlocks(null)).toEqual([]);
    expect(joinTopLevelBlocks([])).toEqual({ version: 4, content: { type: "doc", content: [] } });
  });
});
