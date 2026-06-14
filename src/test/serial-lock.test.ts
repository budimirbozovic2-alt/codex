import { describe, it, expect, beforeEach } from "vitest";
import {
  withSerialLock,
  __resetSerialLockForTests,
} from "@/lib/persistence/sqlite/serial-lock";

describe("withSerialLock", () => {
  beforeEach(() => {
    __resetSerialLockForTests();
  });

  it("runs tasks strictly in order", async () => {
    const order: number[] = [];
    const delays = [30, 10, 20];

    await Promise.all(
      delays.map((ms, i) =>
        withSerialLock(async () => {
          await new Promise((r) => setTimeout(r, ms));
          order.push(i);
        }),
      ),
    );

    expect(order).toEqual([0, 1, 2]);
  });

  it("does not overlap critical sections", async () => {
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        withSerialLock(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
        }),
      ),
    );

    expect(maxActive).toBe(1);
  });

  it("releases lock when fn throws", async () => {
    await expect(
      withSerialLock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    let ran = false;
    await withSerialLock(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
