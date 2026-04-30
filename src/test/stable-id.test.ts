/**
 * Determinism contract for `stableLegacyId`.
 *
 * The function must return the SAME id for the same (scope, name) pair across
 * any number of invocations. This is what protects React keys, IDB references,
 * and form focus from `crypto.randomUUID()` thrash in render/action paths.
 */
import { describe, expect, it } from "vitest";
import { isLegacyStableId, stableLegacyId } from "@/lib/stable-id";

describe("stableLegacyId", () => {
  it("is deterministic across calls", () => {
    const a = stableLegacyId("cat-1", "Glava III");
    const b = stableLegacyId("cat-1", "Glava III");
    expect(a).toBe(b);
  });

  it("normalizes whitespace and case", () => {
    expect(stableLegacyId("cat-1", "Glava III")).toBe(stableLegacyId("cat-1", "  glava iii  "));
  });

  it("differs by scope", () => {
    expect(stableLegacyId("cat-1", "Uvod")).not.toBe(stableLegacyId("cat-2", "Uvod"));
  });

  it("differs by name within the same scope", () => {
    expect(stableLegacyId("cat-1", "A")).not.toBe(stableLegacyId("cat-1", "B"));
  });

  it("produces ids tagged as legacy", () => {
    const id = stableLegacyId("cat-1", "X");
    expect(isLegacyStableId(id)).toBe(true);
    expect(isLegacyStableId(crypto.randomUUID())).toBe(false);
  });

  it("avoids collisions on a 1k-name workload within one scope", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(stableLegacyId("cat-1", `node-${i}`));
    expect(seen.size).toBe(1000);
  });
});
