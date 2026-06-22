import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestSqlExecutor, resetTestSqliteState } from "@/test/sqlite-harness";
import {
  exportLegacyLocalStorageData,
  importLegacyLocalStorageEntry,
  finalizeLegacyDailyMappedImport,
} from "@/lib/backup/legacy-local-storage";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";

vi.mock("@/domains/planner/cache", () => ({
  plannerCache: {
    get: () => ({ createdAt: Date.now() }),
    set: vi.fn(),
  },
  dailyMappedCache: { set: vi.fn() },
}));

describe("legacy localStorage bridge", () => {
  beforeEach(() => {
    resetTestSqliteState();
    localStorage.clear();
  });

  it("exportLegacyLocalStorageData reads appSettings from SQLite", async () => {
    const exec = getTestSqlExecutor();
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      ["appSettings", JSON.stringify({ ...DEFAULT_APP_SETTINGS, soundEffects: true })],
    );
    const data = await exportLegacyLocalStorageData();
    expect((data["sr-app-settings"] as { soundEffects?: boolean })?.soundEffects).toBe(true);
  });

  it("importLegacyLocalStorageEntry writes learn progress to table", async () => {
    const exec = getTestSqlExecutor();
    await exec.run(
      "CREATE TABLE learn_progress (card_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updatedAt INTEGER NOT NULL DEFAULT 0)",
    );
    await importLegacyLocalStorageEntry("sr-learn-progress", {
      c1: {
        mode: "active-recall",
        currentModule: 0,
        completedModules: [],
        chainPosition: 0,
        phase: "preview",
        completed: false,
      },
    });
    const rows = await exec.all<{ card_id: string }>(
      "SELECT card_id FROM learn_progress",
    );
    expect(rows).toHaveLength(1);
    expect(localStorage.getItem("sr-learn-progress")).toBeNull();
  });

  it("finalizeLegacyDailyMappedImport merges paired keys", async () => {
    await finalizeLegacyDailyMappedImport({
      "sr-daily-mapped-date": "2026-06-16",
      "sr-daily-mapped-count": 3,
    });
    const exec = getTestSqlExecutor();
    const row = await exec.all<{ value: string }>(
      "SELECT value FROM kv WHERE key = ?",
      ["dailyMapped"],
    );
    expect(JSON.parse(row[0]?.value ?? "{}")).toEqual({ date: "2026-06-16", count: 3 });
  });
});
