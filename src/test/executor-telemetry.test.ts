// PR-9 A1c-0 — executor telemetry gate.
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  notifyExecutorNull,
  getExecutorMissCounts,
  getTotalExecutorMisses,
  onExecutorMiss,
  __resetExecutorTelemetry,
} from "@/lib/db/queries/_shared/executor-telemetry";

describe("executor-telemetry", () => {
  beforeEach(() => __resetExecutorTelemetry());

  it("starts at zero", () => {
    expect(getTotalExecutorMisses()).toBe(0);
    expect(getExecutorMissCounts()).toEqual({});
  });

  it("increments per (domain, reason)", () => {
    notifyExecutorNull("cards", "non-electron");
    notifyExecutorNull("cards", "non-electron");
    notifyExecutorNull("cards", "error");
    notifyExecutorNull("sources", "non-electron");

    const counts = getExecutorMissCounts();
    expect(counts["cards.non-electron"]).toBe(2);
    expect(counts["cards.error"]).toBe(1);
    expect(counts["sources.non-electron"]).toBe(1);
    expect(getTotalExecutorMisses()).toBe(4);
  });

  it("notifies listeners and supports unsubscribe", () => {
    const fn = vi.fn();
    const off = onExecutorMiss(fn);
    notifyExecutorNull("mindMaps", "error");
    expect(fn).toHaveBeenCalledWith("mindMaps", "error");
    off();
    notifyExecutorNull("mindMaps", "error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exposes a read-only snapshot on window in dev", () => {
    notifyExecutorNull("drafts", "non-electron");
    const snap = (globalThis as unknown as {
      __codex_executorMiss?: { total: number; byKey: Record<string, number> };
    }).__codex_executorMiss;
    expect(snap?.total).toBe(1);
    expect(snap?.byKey["drafts.non-electron"]).toBe(1);
  });
});
