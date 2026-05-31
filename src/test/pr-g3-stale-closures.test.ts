/**
 * PR-G3 (RC-3) regression: stale-closure / remount-contract fixes.
 *
 * Covers the two real bugs found in the audit:
 *   1. `saveAppSettings` must dispatch the in-tab CustomEvent so
 *      same-tab listeners (Dashboard) refresh without a reload — the DOM
 *      `storage` event only fires CROSS-tab and Pure Desktop has just one
 *      window, so without this event the dashboard widgets froze on
 *      whatever value was loaded at first mount.
 *   2. `ReviewPage`'s `useEffect` deps must include `location.key` so a
 *      fresh nav to /review re-fires `startSession` with the latest
 *      snapshot. Tested indirectly by reading the source — we assert the
 *      file shape so the regression is caught at the static layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Mock the SSOT writer so saveAppSettings doesn't touch SQLite. ──────────
vi.mock("@/lib/db/queries", () => ({
  putSetting: vi.fn(async () => { /* noop */ }),
  getSetting: vi.fn(async () => undefined),
}));

beforeEach(() => {
  // Reset localStorage between tests.
  try { localStorage.clear(); } catch { /* noop */ }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PR-G3 — saveAppSettings dispatches in-tab refresh event", () => {
  it("emits the APP_SETTINGS_CHANGED_EVENT after a successful write", async () => {
    const { saveAppSettings, APP_SETTINGS_CHANGED_EVENT, DEFAULT_APP_SETTINGS } =
      await import("@/lib/app-settings");

    const handler = vi.fn();
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
    try {
      await saveAppSettings({ ...DEFAULT_APP_SETTINGS, soundEffects: true });
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
    }
  });

  it("does NOT emit the event when the SSOT write throws", async () => {
    const queries = await import("@/lib/db/queries");
    (queries.putSetting as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("disk full"),
    );

    const { saveAppSettings, APP_SETTINGS_CHANGED_EVENT, DEFAULT_APP_SETTINGS } =
      await import("@/lib/app-settings");

    const handler = vi.fn();
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
    try {
      await expect(
        saveAppSettings({ ...DEFAULT_APP_SETTINGS, soundEffects: true }),
      ).rejects.toThrow(/disk full/);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, handler);
    }
  });
});

describe("PR-G3 — ReviewPage startSession deps include location.key", () => {
  it("ReviewPage useEffect deps list contains location.key (static guard)", () => {
    const src = readFileSync(
      resolve(__dirname, "../views/ReviewPage.tsx"),
      "utf8",
    );
    // Look for the startSession effect's dep array. The regression is
    // restoring `[ready, lockedCategory]` (no location.key) which causes
    // stale snapshots on re-entry to /review.
    expect(src).toMatch(/session\.startSession\(scopedAllCards, reviewLog\)/);
    expect(src).toMatch(/\[ready, lockedCategory, location\.key\]/);
  });

  it("LearnPage already includes location.key (control)", () => {
    const src = readFileSync(
      resolve(__dirname, "../views/LearnPage.tsx"),
      "utf8",
    );
    expect(src).toMatch(/\[ready, location\.key\]/);
  });
});
