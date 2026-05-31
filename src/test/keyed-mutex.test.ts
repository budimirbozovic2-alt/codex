import { describe, it, expect } from "vitest";
import { createKeyedMutex } from "@/lib/concurrency/keyedMutex";
import { tick } from "./helpers/timers";

describe("createKeyedMutex", () => {
  it("serijalizuje pozive pod istim ključem (FIFO)", async () => {
    const m = createKeyedMutex();
    const order: number[] = [];
    const p1 = m.runExclusive("k", async () => { await tick(20); order.push(1); });
    const p2 = m.runExclusive("k", async () => { await tick(5); order.push(2); });
    const p3 = m.runExclusive("k", async () => { order.push(3); });
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("paralelno izvršava pozive pod različitim ključevima", async () => {
    const m = createKeyedMutex();
    let activeA = 0, activeB = 0, maxOverlap = 0;
    const a = m.runExclusive("a", async () => {
      activeA++; maxOverlap = Math.max(maxOverlap, activeA + activeB);
      await tick(20); activeA--;
    });
    const b = m.runExclusive("b", async () => {
      activeB++; maxOverlap = Math.max(maxOverlap, activeA + activeB);
      await tick(20); activeB--;
    });
    await Promise.all([a, b]);
    expect(maxOverlap).toBe(2);
  });

  it("izolacija grešaka: failure jednog ne kvari sljedeće", async () => {
    const m = createKeyedMutex();
    const p1 = m.runExclusive("k", async () => { throw new Error("boom"); }, "test");
    const p2 = m.runExclusive("k", async () => 42);
    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe(42);
  });

  it("pending() broji zakazane i aktivne poslove", async () => {
    const m = createKeyedMutex();
    const p1 = m.runExclusive("k", () => tick(10));
    const p2 = m.runExclusive("k", () => tick(10));
    expect(m.pending("k")).toBe(2);
    await Promise.all([p1, p2]);
    expect(m.pending("k")).toBe(0);
  });

  it("drain() čeka da se lanac isprazni", async () => {
    const m = createKeyedMutex();
    let done = false;
    void m.runExclusive("k", async () => { await tick(15); done = true; });
    await m.drain("k");
    expect(done).toBe(true);
    expect(m.pending("k")).toBe(0);
  });

  it("null ključ koristi globalni lanac", async () => {
    const m = createKeyedMutex();
    const order: number[] = [];
    const p1 = m.runExclusive(null, async () => { await tick(15); order.push(1); });
    const p2 = m.runExclusive(null, async () => { order.push(2); });
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });
});
