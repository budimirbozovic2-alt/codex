import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { eventBus } from "@/lib/event-bus";
import { EVENT_TYPES } from "@/lib/event-bus-types";
import { useCardOnlyActions } from "@/contexts/cards/CardActionsProvider";
import { useCategoryActions } from "@/contexts/cards/CategoryActionsProvider";
import { useBackupActions } from "@/contexts/cards/BackupActionsProvider";

describe("PR2 — provider fallback throws + emits telemetry", () => {
  beforeEach(() => vi.restoreAllMocks());

  function expectThrowAndTelemetry(hook: () => unknown, provider: string, hookName: string) {
    const spy = vi.fn();
    const unsub = eventBus.subscribe(EVENT_TYPES.PROVIDER_FALLBACK, spy);
    let caught: unknown = null;
    try { renderHook(() => hook()); } catch (e) { caught = e; }
    unsub();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(provider);
    expect(spy).toHaveBeenCalledWith({ provider, hook: hookName });
  }

  it("useCardOnlyActions throws bez providera", () => {
    expectThrowAndTelemetry(useCardOnlyActions, "CardActionsProvider", "useCardOnlyActions");
  });

  it("useCategoryActions throws bez providera", () => {
    expectThrowAndTelemetry(useCategoryActions, "CategoryActionsProvider", "useCategoryActions");
  });

  it("useBackupActions throws bez providera", () => {
    expectThrowAndTelemetry(useBackupActions, "BackupActionsProvider", "useBackupActions");
  });
});
