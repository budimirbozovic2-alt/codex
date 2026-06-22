import { describe, expect, it } from "vitest";
import { makeCard } from "@/test/factories";
import { sortPassiveReaderCards } from "@/components/subject-cards/passive-reader/sort-passive-reader-cards";

describe("sortPassiveReaderCards", () => {
  it("tie-breaks equal createdAt by id for stable ordering", () => {
    const ts = 1_000;
    const a = makeCard({ id: "z-last", createdAt: ts });
    const b = makeCard({ id: "a-first", createdAt: ts });
    const c = makeCard({ id: "m-mid", createdAt: ts });

    const sorted = [a, b, c].sort(sortPassiveReaderCards);
    expect(sorted.map(c => c.id)).toEqual(["a-first", "m-mid", "z-last"]);
  });
});
