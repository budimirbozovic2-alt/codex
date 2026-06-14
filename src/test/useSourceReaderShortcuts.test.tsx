import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSourceReaderShortcuts } from "@/hooks/source-reader/useSourceReaderShortcuts";
import { useSourceReaderStore } from "@/store";

describe("useSourceReaderShortcuts", () => {
  beforeEach(() => {
    useSourceReaderStore.getState().reset();
  });

  function fireKey(
    key: string,
    opts?: { tagName?: string; contentEditable?: boolean },
  ) {
    const tag = (opts?.tagName ?? "DIV").toLowerCase();
    const host = document.createElement(tag);
    if (opts?.contentEditable) {
      host.setAttribute("contenteditable", "true");
      Object.defineProperty(host, "isContentEditable", { value: true, configurable: true });
    }
    document.body.appendChild(host);
    act(() => {
      host.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
    host.remove();
  }

  it("S key invokes onConvertToEssay in read mode", () => {
    const onConvert = vi.fn();
    useSourceReaderStore.getState().setEditMode(false);
    renderHook(() => useSourceReaderShortcuts({ onConvertToEssay: onConvert }));

    fireKey("s");
    expect(onConvert).toHaveBeenCalledTimes(1);
  });

  it("S key is ignored in edit mode", () => {
    const onConvert = vi.fn();
    useSourceReaderStore.getState().setEditMode(true);
    renderHook(() => useSourceReaderShortcuts({ onConvertToEssay: onConvert }));

    fireKey("s");
    expect(onConvert).not.toHaveBeenCalled();
  });

  it("S key is ignored when focus is in contenteditable during edit mode", () => {
    const onConvert = vi.fn();
    useSourceReaderStore.getState().setEditMode(true);
    renderHook(() => useSourceReaderShortcuts({ onConvertToEssay: onConvert }));

    fireKey("s", { contentEditable: true });
    expect(onConvert).not.toHaveBeenCalled();
  });

  it("S key works in read-only ProseMirror (contenteditable, editMode false)", () => {
    const onConvert = vi.fn();
    useSourceReaderStore.getState().setEditMode(false);
    renderHook(() => useSourceReaderShortcuts({ onConvertToEssay: onConvert }));

    fireKey("s", { contentEditable: true });
    expect(onConvert).toHaveBeenCalledTimes(1);
  });

  it("M key toggles exam sidebar from read-only ProseMirror", () => {
    useSourceReaderStore.getState().setEditMode(false);
    renderHook(() => useSourceReaderShortcuts({ onConvertToEssay: vi.fn() }));

    fireKey("m", { contentEditable: true });
    expect(useSourceReaderStore.getState().examOpen).toBe(true);
  });

  it("M key toggles exam sidebar", () => {
    renderHook(() => useSourceReaderShortcuts({ onConvertToEssay: vi.fn() }));
    expect(useSourceReaderStore.getState().examOpen).toBe(false);

    fireKey("m");
    expect(useSourceReaderStore.getState().examOpen).toBe(true);

    fireKey("M");
    expect(useSourceReaderStore.getState().examOpen).toBe(false);
  });

  it("Escape closes split summary dialog", () => {
    useSourceReaderStore.getState().setSplitSummaryOpen(true);
    useSourceReaderStore.getState().setSplitResult({
      modules: [],
      rangeLabel: "x",
      parentName: "y",
    });
    renderHook(() => useSourceReaderShortcuts({ onConvertToEssay: vi.fn() }));

    fireKey("Escape");
    expect(useSourceReaderStore.getState().splitSummaryOpen).toBe(false);
    expect(useSourceReaderStore.getState().splitResult).toBeNull();
  });
});
