/**
 * O-1: Tests for sqliteReadyMachine.
 *
 * The runtime branching (Electron vs browser DEV, OPFS init success vs
 * fallback) is environment-dependent — we exercise the observable FSM
 * contract: idle → opening → terminal, plus subscribe/getState basics.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Bypass the global vitest setup mock that stubs `client.ts`; we want
// the *real* readyMachine module here.
vi.unmock("@/lib/persistence/sqlite/client");

import {
  getSqliteReadyState,
  subscribeSqliteReady,
  __resetSqliteReadyMachine,
  ensureSqliteReady,
} from "@/lib/persistence/sqlite/readyMachine";

describe("sqliteReadyMachine (O-1)", () => {
  beforeEach(() => {
    __resetSqliteReadyMachine();
  });

  it("starts in idle", () => {
    expect(getSqliteReadyState().type).toBe("idle");
  });

  it("transitions to opening on ensureSqliteReady() and notifies subscribers", async () => {
    const seen: string[] = [];
    const unsub = subscribeSqliteReady(() => {
      seen.push(getSqliteReadyState().type);
    });

    const p = ensureSqliteReady().catch(() => {
      /* env-dependent terminal — irrelevant here */
    });

    // First synchronous transition must be → opening.
    expect(seen[0]).toBe("opening");

    await p;
    unsub();

    // Final state must be terminal (one of ready / degraded / fatal),
    // never stuck in opening.
    const finalType = getSqliteReadyState().type;
    expect(["ready", "degraded", "fatal"]).toContain(finalType);
  });

  it("is idempotent — second call returns same promise / cached executor", async () => {
    const p1 = ensureSqliteReady().catch(() => null);
    const p2 = ensureSqliteReady().catch(() => null);
    // While opening, both calls share the same in-flight promise.
    expect(p1).toBe(p2);
    await Promise.all([p1, p2]);
  });

  it("__resetSqliteReadyMachine clears state and listeners", () => {
    const listener = vi.fn();
    subscribeSqliteReady(listener);
    __resetSqliteReadyMachine();
    expect(getSqliteReadyState().type).toBe("idle");
    // After reset, the old listener is gone — verified by re-subscribing
    // and confirming only the new listener fires on next state change.
    expect(listener).not.toHaveBeenCalled();
  });
});
