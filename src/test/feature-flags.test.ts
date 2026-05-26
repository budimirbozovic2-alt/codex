// PR-7e: registry is empty after dual-read teardown. Smoke-only — verifies
// the API surface still resolves predictably for any unknown key.
import { describe, it, expect, beforeEach } from "vitest";
import {
  isFeatureEnabled,
  __resetFeatureFlagsForTests,
} from "@/lib/feature-flags";

describe("feature flags", () => {
  beforeEach(() => {
    __resetFeatureFlagsForTests();
    try { localStorage.clear(); } catch { /* noop */ }
  });

  it("unknown key returns false (empty registry)", () => {
    expect(isFeatureEnabled("__missing__" as never)).toBe(false);
  });
});
