import { describe, expect, it } from "vitest";

/** Mirrors LearnSession effectiveIndex clamp — stale sessionStorage must not hide cards. */
function effectiveLearnIndex(currentIndex: number, sortedLen: number): number {
  if (sortedLen === 0) return 0;
  return Math.min(Math.max(0, currentIndex), sortedLen - 1);
}

describe("learn session index clamp", () => {
  it("clamps stale sessionStorage index into range", () => {
    expect(effectiveLearnIndex(47, 10)).toBe(9);
    expect(effectiveLearnIndex(-3, 5)).toBe(0);
  });

  it("preserves valid index", () => {
    expect(effectiveLearnIndex(2, 10)).toBe(2);
  });
});
