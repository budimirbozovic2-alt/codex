import { describe, it, expect } from "vitest";
import { kvGet, kvPut, healLegacyKvScalars } from "@/lib/persistence/sqlite/kv";
import { bindKv } from "@/lib/backup/sqlite-row-bindings";
import { getTestSqlExecutor, resetTestSqliteState } from "@/test/sqlite-harness";

describe("sqlite kv", () => {
  it("round-trips JSON values", async () => {
    resetTestSqliteState();
    const exec = getTestSqlExecutor();
    await kvPut(exec, "plannerConfig", { dailyQuotaOverride: 12 });
    const got = await kvGet<{ dailyQuotaOverride: number }>(exec, "plannerConfig");
    expect(got).toEqual({ dailyQuotaOverride: 12 });
  });

  it("heals legacy plain date strings (lastRedistribute)", async () => {
    resetTestSqliteState();
    const exec = getTestSqlExecutor();
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      ["lastRedistribute", "2026-06-16"],
    );
    const got = await kvGet<string>(exec, "lastRedistribute");
    expect(got).toBe("2026-06-16");
    const rows = await exec.all<{ value: string }>(
      "SELECT value FROM kv WHERE key = ?",
      ["lastRedistribute"],
    );
    expect(rows[0]?.value).toBe(JSON.stringify("2026-06-16"));
  });

  it("bindKv always JSON-encodes string scalars", () => {
    const [, value] = bindKv({ key: "lastRedistribute", value: "2026-06-16" });
    expect(value).toBe(JSON.stringify("2026-06-16"));
  });

  it("healLegacyKvScalars repairs all corrupt scalar rows", async () => {
    resetTestSqliteState();
    const exec = getTestSqlExecutor();
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      ["lastRedistribute", "2026-06-16"],
    );
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      ["dailyMappedDate", "2026-06-15"],
    );
    const healed = await healLegacyKvScalars(exec);
    expect(healed).toBe(2);
    const row = await exec.all<{ value: string }>(
      "SELECT value FROM kv WHERE key = ?",
      ["lastRedistribute"],
    );
    expect(row[0]?.value).toBe(JSON.stringify("2026-06-16"));
  });
});
