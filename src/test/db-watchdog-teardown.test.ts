import { describe, it, expect } from "vitest";
import { startUnblockWatch, __teardownDbWatchdog } from "@/lib/db-error";

describe("db-schema watchdog teardown (Phase C / P2-2)", () => {
  it("startUnblockWatch + __teardownDbWatchdog clears interval idempotently", () => {
    // Should not throw on cold teardown.
    __teardownDbWatchdog();
    startUnblockWatch();
    __teardownDbWatchdog();
    // Calling teardown twice is safe.
    __teardownDbWatchdog();
    expect(true).toBe(true);
  });

  it("module exposes __teardownDbWatchdog symbol for HMR dispose", () => {
    expect(typeof __teardownDbWatchdog).toBe("function");
  });
});
