import { describe, it, expect, vi, beforeEach } from "vitest";
import { setDbEventEmitter, setDbErrorState } from "@/lib/db-schema";
import { EVENT_TYPES } from "@/lib/event-bus-types";

describe("db-schema — W1 DI emitter", () => {
  beforeEach(() => {
    // reset to no-op so other tests don't leak through the spy
    setDbEventEmitter(() => {});
  });

  it("forwards DB_ERROR_CHANGED through the injected emitter", () => {
    const spy = vi.fn();
    setDbEventEmitter(spy);
    setDbErrorState({ type: "timeout", message: "boom" });
    expect(spy).toHaveBeenCalledWith(EVENT_TYPES.DB_ERROR_CHANGED, { type: "timeout", message: "boom" });
    setDbErrorState(null); // cleanup
  });

  it("no-op default emitter does not throw when bootstrap hasn't injected", () => {
    setDbEventEmitter(() => {}); // explicit no-op
    expect(() => setDbErrorState({ type: "version", message: "x" })).not.toThrow();
    setDbErrorState(null);
  });
});
