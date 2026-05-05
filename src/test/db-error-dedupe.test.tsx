import { describe, it, expect, beforeEach } from "vitest";

// M5 regression: DbErrorProvider must dedupe identical DbErrorState bursts so
// downstream consumers don't re-render on every cascaded DB_BLOCKED emit.
import { DbErrorProvider, useDbError } from "@/contexts/db/DbErrorProvider";
import { eventBus } from "@/lib/event-bus";
import { EVENT_TYPES } from "@/lib/event-bus-types";
import { render } from "@testing-library/react";
import { act } from "react";

let renderCount = 0;
function Probe() {
  useDbError();
  renderCount++;
  return null;
}

describe("DbErrorProvider — M5 dedupe", () => {
  beforeEach(() => { renderCount = 0; });

  it("does not re-render on identical consecutive DB error states", () => {
    render(<DbErrorProvider><Probe /></DbErrorProvider>);
    const initial = renderCount;

    act(() => {
      eventBus.emit(EVENT_TYPES.DB_ERROR_CHANGED, { type: "timeout", message: "x" });
    });
    const afterFirst = renderCount;
    expect(afterFirst).toBeGreaterThan(initial);

    act(() => {
      for (let i = 0; i < 5; i++) {
        eventBus.emit(EVENT_TYPES.DB_ERROR_CHANGED, { type: "timeout", message: "x" });
      }
    });
    // Identical payloads -> no additional renders
    expect(renderCount).toBe(afterFirst);

    act(() => {
      eventBus.emit(EVENT_TYPES.DB_ERROR_CHANGED, { type: "version", message: "y" });
    });
    expect(renderCount).toBeGreaterThan(afterFirst);
  });
});

describe("eventBus — W3 globalThis singleton", () => {
  it("returns the same instance across re-imports (HMR-safe)", async () => {
    const a = (await import("@/lib/event-bus")).eventBus;
    const b = (await import("@/lib/event-bus")).eventBus;
    expect(a).toBe(b);
    expect(typeof a.getListenerCount).toBe("function");
    expect(a.getListenerCount()).toBeGreaterThanOrEqual(0);
  });
});
