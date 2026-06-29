import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getHealDefinitionsForUpgrade,
  runPostMigrationHeals,
} from "@/lib/persistence/sqlite/post-migration-heals";
import { getTestSqlExecutor, resetTestSqliteState } from "@/test/sqlite-harness";

describe("post-migration-heals (TD-ARCH-7)", () => {
  it("returns no heals for fresh-install context (fromVersion 0)", () => {
    const heals = getHealDefinitionsForUpgrade({ fromVersion: 0, toVersion: 17 });
    expect(heals).toHaveLength(0);
  });

  it("returns only heals for versions crossed in upgrade window", () => {
    const heals = getHealDefinitionsForUpgrade({ fromVersion: 7, toVersion: 10 });
    expect(heals.map((h) => h.name)).toEqual([
      "card-mastery-score",
      "card-mastery-level",
      "card-saga-links",
    ]);
  });

  it("includes learn-progress heal when upgrading from 15 to 16", () => {
    const heals = getHealDefinitionsForUpgrade({ fromVersion: 15, toVersion: 16 });
    expect(heals.map((h) => h.name)).toEqual(["learn-progress-relational"]);
  });

  it("includes card-sections-normalized heal when upgrading from 16 to 17", () => {
    const heals = getHealDefinitionsForUpgrade({ fromVersion: 16, toVersion: 17 });
    expect(heals.map((h) => h.name)).toEqual(["card-sections-normalized"]);
  });

  it("skips already-applied heals when from equals to", () => {
    const heals = getHealDefinitionsForUpgrade({ fromVersion: 17, toVersion: 17 });
    expect(heals).toHaveLength(0);
  });
});

describe("runMigrations routing (TD-ARCH-7)", () => {
  beforeEach(() => {
    vi.resetModules();
    resetTestSqliteState();
  });

  it("fresh install uses applyFreshSchema and skips post-migration heals", async () => {
    const exec = getTestSqlExecutor();
    const v2 = await import("@/lib/persistence/sqlite/migration-runner-v2");
    const freshSpy = vi.spyOn(v2, "applyFreshSchema").mockResolvedValue(undefined);
    const heals = await import("@/lib/persistence/sqlite/post-migration-heals");
    const healSpy = vi.spyOn(heals, "runPostMigrationHeals");

    const { runMigrations, TARGET_USER_VERSION } = await import(
      "@/lib/persistence/sqlite/migration-runner"
    );

    const result = await runMigrations(exec);

    expect(result).toEqual({ from: 0, to: TARGET_USER_VERSION });
    expect(freshSpy).toHaveBeenCalledTimes(1);
    expect(healSpy).not.toHaveBeenCalled();

    freshSpy.mockRestore();
    healSpy.mockRestore();
  });

  it("upgrade path runs post-migration heals with fromVersion", async () => {
    const exec = getTestSqlExecutor();
    await exec.run("PRAGMA user_version = 7");

    const heals = await import("@/lib/persistence/sqlite/post-migration-heals");
    const healSpy = vi.spyOn(heals, "runPostMigrationHeals").mockResolvedValue({
      fromVersion: 7,
      toVersion: 17,
      steps: [{ name: "card-mastery-score", minVersion: 8, skipped: false }],
    });

    const { runMigrations, TARGET_USER_VERSION } = await import(
      "@/lib/persistence/sqlite/migration-runner"
    );

    const result = await runMigrations(exec);

    expect(result.from).toBe(7);
    expect(result.to).toBe(TARGET_USER_VERSION);
    expect(healSpy).toHaveBeenCalledWith(exec, {
      fromVersion: 7,
      toVersion: TARGET_USER_VERSION,
    });

    healSpy.mockRestore();
  });
});

describe("runPostMigrationHeals report", () => {
  beforeEach(() => {
    resetTestSqliteState();
  });

  it("runs learn-progress heal when upgrading 15 → 16", async () => {
    const exec = getTestSqlExecutor();

    const report = await runPostMigrationHeals(exec, {
      fromVersion: 15,
      toVersion: 16,
    });

    expect(report.fromVersion).toBe(15);
    expect(report.toVersion).toBe(16);
    expect(report.steps.some((s) => s.name === "learn-progress-relational")).toBe(true);
  });
});
