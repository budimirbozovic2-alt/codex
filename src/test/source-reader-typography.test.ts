import { describe, it, expect, beforeEach } from "vitest";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";

describe("source reader typography store", () => {
  beforeEach(() => {
    localStorage.clear();
    useSourceReaderStore.getState().reset();
  });

  it("updates font size and line height in state", () => {
    useSourceReaderStore.getState().setReaderFontSize("lg");
    useSourceReaderStore.getState().setReaderLineHeight("loose");

    expect(useSourceReaderStore.getState().readerFontSize).toBe("lg");
    expect(useSourceReaderStore.getState().readerLineHeight).toBe("loose");
  });

  it("persists typography choices to localStorage", () => {
    useSourceReaderStore.getState().setReaderFontSize("sm");
    useSourceReaderStore.getState().setReaderLineHeight("relaxed");

    expect(localStorage.getItem("codex-source-reader-font-size")).toBe("sm");
    expect(localStorage.getItem("codex-source-reader-line-height")).toBe("relaxed");
  });

  it("reloads persisted values after reset and re-init", () => {
    localStorage.setItem("codex-source-reader-font-size", "lg");
    localStorage.setItem("codex-source-reader-line-height", "normal");
    useSourceReaderStore.getState().reset();

    expect(useSourceReaderStore.getState().readerFontSize).toBe("lg");
    expect(useSourceReaderStore.getState().readerLineHeight).toBe("normal");
  });
});
