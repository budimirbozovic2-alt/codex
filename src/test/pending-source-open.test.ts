import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SR_OPEN_SOURCE_ID_KEY,
  SOURCE_READER_OPEN_EVENT,
  queueSourceReaderOpen,
  consumePendingSourceOpen,
} from "@/lib/source-reader/pending-source-open";

describe("pending-source-open", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("queueSourceReaderOpen writes sessionStorage and dispatches event", () => {
    const handler = vi.fn();
    window.addEventListener(SOURCE_READER_OPEN_EVENT, handler);

    queueSourceReaderOpen("src-42");

    expect(sessionStorage.getItem(SR_OPEN_SOURCE_ID_KEY)).toBe("src-42");
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ sourceId: "src-42" });

    window.removeEventListener(SOURCE_READER_OPEN_EVENT, handler);
  });

  it("consumePendingSourceOpen resolves and clears the pending id", () => {
    sessionStorage.setItem(SR_OPEN_SOURCE_ID_KEY, "src-a");
    const sources = [{ id: "src-a", title: "A" }, { id: "src-b", title: "B" }];

    const found = consumePendingSourceOpen(sources);
    expect(found?.id).toBe("src-a");
    expect(sessionStorage.getItem(SR_OPEN_SOURCE_ID_KEY)).toBeNull();
  });

  it("consumePendingSourceOpen returns undefined when sources are still loading", () => {
    sessionStorage.setItem(SR_OPEN_SOURCE_ID_KEY, "src-a");
    expect(consumePendingSourceOpen([])).toBeUndefined();
    expect(sessionStorage.getItem(SR_OPEN_SOURCE_ID_KEY)).toBe("src-a");
  });

  it("consumePendingSourceOpen clears storage even when id is missing from list", () => {
    sessionStorage.setItem(SR_OPEN_SOURCE_ID_KEY, "gone");
    expect(consumePendingSourceOpen([{ id: "other" }])).toBeUndefined();
    expect(sessionStorage.getItem(SR_OPEN_SOURCE_ID_KEY)).toBeNull();
  });

  it("event-driven re-consume works without sources reference change", () => {
    const sources = [{ id: "src-z", title: "Z" }];
    const opened: string[] = [];
    const onEvent = () => {
      const hit = consumePendingSourceOpen(sources);
      if (hit) opened.push(hit.id);
    };
    window.addEventListener(SOURCE_READER_OPEN_EVENT, onEvent);

    queueSourceReaderOpen("src-z");
    expect(opened).toEqual(["src-z"]);

    window.removeEventListener(SOURCE_READER_OPEN_EVENT, onEvent);
  });
});
