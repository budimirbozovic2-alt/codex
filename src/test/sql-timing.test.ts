import { describe, it, expect, beforeEach } from "vitest";
import {
  withSqlTiming,
  getSqlTimings,
  __resetSqlTimings,
} from "@/lib/db/queries/_shared/sql-timing";

describe("sql-timing", () => {
  beforeEach(() => { __resetSqlTimings(); });

  it("records duration and increments count per label", async () => {
    await withSqlTiming("listAllCards", async () => 1);
    await withSqlTiming("listAllCards", async () => 2);
    await withSqlTiming("listAllSources", async () => 3);

    const snap = getSqlTimings();
    const cards = snap.find((s) => s.label === "listAllCards");
    const sources = snap.find((s) => s.label === "listAllSources");

    expect(cards?.count).toBe(2);
    expect(sources?.count).toBe(1);
    expect(cards?.max).toBeGreaterThanOrEqual(0);
  });

  it("propagates return value and rejections", async () => {
    const v = await withSqlTiming("ok", async () => 42);
    expect(v).toBe(42);

    await expect(
      withSqlTiming("bad", async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");

    const snap = getSqlTimings();
    expect(snap.find((s) => s.label === "bad")?.count).toBe(1);
  });

  it("computes p50/p95 from samples", async () => {
    for (let i = 0; i < 100; i++) {
      await withSqlTiming("mixed", async () => i);
    }
    const snap = getSqlTimings();
    const m = snap.find((s) => s.label === "mixed");
    expect(m).toBeDefined();
    expect(m!.count).toBe(100);
    expect(m!.p95).toBeGreaterThanOrEqual(m!.p50);
    expect(m!.max).toBeGreaterThanOrEqual(m!.p95);
  });
});
