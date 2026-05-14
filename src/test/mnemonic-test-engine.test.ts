import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTestEngine, RECALL_TIME_LIMIT } from "@/hooks/mnemonic/useTestEngine";
import type { MnemonicCard } from "@/lib/mnemonic-storage";

function card(id: string): MnemonicCard {
  return {
    id,
    originalCardId: "o-" + id,
    question: "q",
    sections: [],
    categoryId: "cat",
    hookType: "rokovi",
    hookMode: "video",
    mnemonicVideo: "",
    acronym: "",
    mnemonicStatus: "ready",
    createdAt: 0,
    testCount: 0,
    successCount: 0,
    failCount: 0,
    lastTested: null,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTestEngine", () => {
  it("walks selector → reminder → test → finished", () => {
    const onRecord = vi.fn();
    const { result } = renderHook(() => useTestEngine({ onRecordResult: onRecord }));

    expect(result.current.phase).toBe("selector");

    act(() => result.current.startSession([card("a"), card("b")]));
    expect(result.current.phase).toBe("reminder");
    expect(result.current.queue).toHaveLength(2);

    act(() => result.current.enterTestPhase());
    expect(result.current.phase).toBe("test");

    act(() => result.current.answer(true));
    expect(result.current.sessionStats).toEqual({ correct: 1, wrong: 0 });
    expect(result.current.currentIndex).toBe(1);

    act(() => result.current.answer(false));
    expect(onRecord).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe("finished");
    expect(result.current.sessionStats).toEqual({ correct: 1, wrong: 1 });
  });

  it("countdown timer flips timedOut after recall limit elapses", () => {
    const { result } = renderHook(() => useTestEngine({ onRecordResult: vi.fn() }));
    act(() => result.current.startSession([card("a")]));
    act(() => result.current.enterTestPhase());
    act(() => result.current.startRecall());
    expect(result.current.showTrigger).toBe(true);
    expect(result.current.timedOut).toBe(false);

    // Advance past the limit (100ms ticks). Use a generous buffer.
    act(() => { vi.advanceTimersByTime((RECALL_TIME_LIMIT + 1) * 1000); });
    expect(result.current.timedOut).toBe(true);
    expect(result.current.timeLeft).toBeLessThanOrEqual(0.1);
  });

  it("gotoSelector returns to phase=selector at any time", () => {
    const { result } = renderHook(() => useTestEngine({ onRecordResult: vi.fn() }));
    act(() => result.current.startSession([card("a")]));
    act(() => result.current.enterTestPhase());
    act(() => result.current.gotoSelector());
    expect(result.current.phase).toBe("selector");
  });
});
