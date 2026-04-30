import { describe, expect, it } from "vitest";
import { sameStringSet, sameStringList, shallowEqual, shallowEqualByKeys, sameSourceModules } from "@/lib/struct-eq";

describe("sameStringSet", () => {
  it("treats reordered lists as equal", () => {
    expect(sameStringSet(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });
  it("differs when an element is missing", () => {
    expect(sameStringSet(["a", "b"], ["a", "c"])).toBe(false);
  });
  it("handles empty + nullish", () => {
    expect(sameStringSet([], [])).toBe(true);
    expect(sameStringSet(null, undefined)).toBe(true);
    expect(sameStringSet(["a"], [])).toBe(false);
  });
});

describe("sameStringList", () => {
  it("is order-sensitive", () => {
    expect(sameStringList(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameStringList(["a", "b"], ["a", "b"])).toBe(true);
  });
});

describe("shallowEqual", () => {
  it("returns true for identical primitives", () => {
    expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
  });
  it("returns false on key set divergence", () => {
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 } as Record<string, unknown>)).toBe(false);
  });
  it("returns false on value divergence", () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("shallowEqualByKeys", () => {
  it("ignores extra keys not listed", () => {
    expect(shallowEqualByKeys({ a: 1, b: 2 }, { a: 1, b: 99 }, ["a"])).toBe(true);
  });
});

describe("sameSourceModules", () => {
  it("ignores order, compares by id", () => {
    const a = [{ id: "1", text: "x", order: 0 }, { id: "2", text: "y", order: 1 }];
    const b = [{ id: "2", text: "y", order: 1 }, { id: "1", text: "x", order: 0 }];
    expect(sameSourceModules(a, b)).toBe(true);
  });
  it("detects content drift on the same id", () => {
    const a = [{ id: "1", text: "x" }];
    const b = [{ id: "1", text: "y" }];
    expect(sameSourceModules(a, b)).toBe(false);
  });
  it("detects missing ids", () => {
    expect(sameSourceModules([{ id: "1" }], [{ id: "2" }])).toBe(false);
  });
});
