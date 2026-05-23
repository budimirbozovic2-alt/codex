import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftAutosave } from "@/hooks/useDraftAutosave";
import { draftRegistry } from "@/lib/drafts/draftRegistry";

vi.mock("@/lib/drafts/draftsTable", () => ({
  putDraft: vi.fn().mockResolvedValue(undefined),
  getDraft: vi.fn().mockResolvedValue(undefined),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
  listDraftsBySource: vi.fn().mockResolvedValue([]),
}));

describe("useDraftAutosave", () => {
  beforeEach(() => {
    draftRegistry._resetForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts clean and reflects dirty after edit", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDraftAutosave({
        key: "test:1",
        source: "test",
        initial: { title: "A" },
        save,
        equals: (a, b) => a.title === b.title,
        debounceMs: 200,
      }),
    );

    expect(result.current.isDirty).toBe(false);
    expect(draftRegistry.isDirty("test:1")).toBe(false);

    act(() => { result.current.setDraft({ title: "B" }); });
    expect(result.current.isDirty).toBe(true);
    expect(draftRegistry.isDirty("test:1")).toBe(true);
  });

  it("debounces save and clears dirty after success", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ initial }) => useDraftAutosave({
        key: "test:debounce",
        source: "test",
        initial,
        save,
        equals: (a, b) => a.v === b.v,
        debounceMs: 200,
      }),
      { initialProps: { initial: { v: 1 } } },
    );

    act(() => { result.current.setDraft({ v: 2 }); });
    expect(save).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(save).toHaveBeenCalledWith({ v: 2 });

    // Caller pushes the persisted value back; dirty derives from equality.
    rerender({ initial: { v: 2 } });
    expect(result.current.isDirty).toBe(false);
    expect(draftRegistry.isDirty("test:debounce")).toBe(false);
  });

  it("saveNow bypasses debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDraftAutosave({
        key: "test:now",
        source: "test",
        initial: { v: 1 },
        save,
        equals: (a, b) => a.v === b.v,
        debounceMs: 5000,
      }),
    );

    act(() => { result.current.setDraft({ v: 9 }); });
    await act(async () => { await result.current.saveNow(); });
    expect(save).toHaveBeenCalledWith({ v: 9 });
  });

  it("discard reverts and clears registry", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDraftAutosave({
        key: "test:discard",
        source: "test",
        initial: { v: 1 },
        save,
        equals: (a, b) => a.v === b.v,
      }),
    );
    act(() => { result.current.setDraft({ v: 2 }); });
    expect(draftRegistry.isDirty("test:discard")).toBe(true);
    act(() => { result.current.discard(); });
    expect(result.current.draft).toEqual({ v: 1 });
    expect(draftRegistry.isDirty("test:discard")).toBe(false);
  });
});
