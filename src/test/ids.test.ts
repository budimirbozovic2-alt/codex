import { describe, it, expect } from "vitest";
import {
  asCategoryId, asCardId, asSourceId, asSubcategoryId, asChapterId,
  isCategoryId, isUuidLike,
  type CategoryId, type CardId,
} from "@/lib/ids";

const UUID = "11111111-2222-4333-8444-555555555555";
const LEGACY = "legacy-deadbeef-1234-5678-9abc-cafebabe0000";

describe("ids — branded UUID types", () => {
  it("accepts RFC-4122 UUIDs", () => {
    const cid = asCategoryId(UUID);
    expect(cid).toBe(UUID);
    expect(isCategoryId(cid)).toBe(true);
  });

  it("accepts legacy- deterministic ids", () => {
    expect(isUuidLike(LEGACY)).toBe(true);
    expect(asSourceId(LEGACY)).toBe(LEGACY);
  });

  it("rejects malformed ids in DEV (throws)", () => {
    expect(() => asCardId("not-a-uuid")).toThrow();
    expect(() => asSubcategoryId("")).toThrow();
    expect(() => asChapterId("123")).toThrow();
  });

  it("brands are string-compatible at runtime", () => {
    const a: CategoryId = asCategoryId(UUID);
    const b: CardId = asCardId(UUID);
    // Both are still plain strings under the hood.
    expect(typeof a).toBe("string");
    expect(`${a}`).toBe(UUID);
    expect(a === b as unknown as string).toBe(true);
  });

  it("isCategoryId narrows unknown values", () => {
    const x: unknown = UUID;
    if (isCategoryId(x)) {
      // Type narrowed; runtime is the same string.
      expect(x.length).toBe(UUID.length);
    } else {
      throw new Error("expected narrowing to succeed");
    }
  });
});
