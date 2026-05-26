/**
 * PR-7d M2.4 — WriteResult contract + wrapWrite error mapping.
 */
import { describe, it, expect } from "vitest";
import { ok, err, wrapWrite } from "@/lib/persistence/write-result";

describe("WriteResult", () => {
  it("ok() wraps value", () => {
    const r = ok({ id: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe("x");
  });

  it("err() carries code + message", () => {
    const r = err("VALIDATION", "bad");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("VALIDATION");
      expect(r.error.message).toBe("bad");
    }
  });

  it("wrapWrite returns ok on success", async () => {
    const r = await wrapWrite(async () => 42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("wrapWrite maps QUOTA_EXCEEDED throws", async () => {
    const r = await wrapWrite(() => { throw new Error("QUOTA_EXCEEDED"); });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("QUOTA_EXCEEDED");
  });

  it("wrapWrite maps generic throws to PERSIST_FAILED", async () => {
    const r = await wrapWrite(() => { throw new Error("boom"); });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PERSIST_FAILED");
  });
});
