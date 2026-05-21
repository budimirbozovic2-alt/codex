// Phase 2 — feature-flag snapshot + override behavior.
import { describe, it, expect, beforeEach } from "vitest";
import {
  isFeatureEnabled,
  setFeatureOverride,
  __resetFeatureFlagsForTests,
} from "@/lib/feature-flags";

describe("feature flags", () => {
  beforeEach(() => {
    __resetFeatureFlagsForTests();
    try { localStorage.clear(); } catch { /* noop */ }
  });

  it("USE_DB_LIVE_SELECTORS defaults to DEV value", () => {
    const expected = Boolean(import.meta.env?.DEV);
    expect(isFeatureEnabled("USE_DB_LIVE_SELECTORS")).toBe(expected);
  });

  it("explicit override persists in localStorage", () => {
    setFeatureOverride("USE_DB_LIVE_SELECTORS", false);
    __resetFeatureFlagsForTests();
    expect(isFeatureEnabled("USE_DB_LIVE_SELECTORS")).toBe(false);
    setFeatureOverride("USE_DB_LIVE_SELECTORS", true);
    __resetFeatureFlagsForTests();
    expect(isFeatureEnabled("USE_DB_LIVE_SELECTORS")).toBe(true);
  });

  it("clearing override reverts to default", () => {
    setFeatureOverride("USE_DB_LIVE_SELECTORS", false);
    __resetFeatureFlagsForTests();
    expect(isFeatureEnabled("USE_DB_LIVE_SELECTORS")).toBe(false);
    setFeatureOverride("USE_DB_LIVE_SELECTORS", null);
    __resetFeatureFlagsForTests();
    expect(isFeatureEnabled("USE_DB_LIVE_SELECTORS")).toBe(
      Boolean(import.meta.env?.DEV),
    );
  });

  it("snapshot is stable within a session (no reset)", () => {
    const first = isFeatureEnabled("USE_DB_LIVE_SELECTORS");
    setFeatureOverride("USE_DB_LIVE_SELECTORS", !first);
    // No reset — session snapshot wins.
    expect(isFeatureEnabled("USE_DB_LIVE_SELECTORS")).toBe(first);
  });
});
