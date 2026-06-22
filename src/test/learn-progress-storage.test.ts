import { describe, it, expect, beforeEach } from "vitest";
import { makeCard } from "@/test/factories";
import { getTestSqlExecutor, resetTestSqliteState } from "@/test/sqlite-harness";
import {
  loadAllLearnProgress,
  replaceAllLearnProgress,
  clearLearnProgress,
} from "@/lib/db/queries/learn-progress";
import { migrateLearnProgressToRelational } from "@/lib/persistence/sqlite/learn-progress-migration";
import type { LearnCardProgress } from "@/lib/types/logs";
import { resetCardLearningProgress } from "@/lib/reset/reset-section-progress";
import { loadLearnProgress, saveLearnProgress } from "@/lib/storage";

const sampleProgress: LearnCardProgress = {
  mode: "active-recall",
  currentModule: 1,
  completedModules: [0],
  chainPosition: 0,
  phase: "drill",
  completed: false,
};

describe("learn progress relational storage", () => {
  beforeEach(() => {
    resetTestSqliteState();
  });

  it("replaceAll + loadAll round-trips card progress", async () => {
    const exec = getTestSqlExecutor();
    await exec.run(
      "CREATE TABLE learn_progress (card_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updatedAt INTEGER NOT NULL DEFAULT 0)",
    );
    await replaceAllLearnProgress({ "card-a": sampleProgress });
    const loaded = await loadAllLearnProgress();
    expect(loaded["card-a"]).toEqual(sampleProgress);
  });

  it("migrateLearnProgressToRelational moves KV blob into table", async () => {
    const exec = getTestSqlExecutor();
    await exec.run(
      "CREATE TABLE learn_progress (card_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updatedAt INTEGER NOT NULL DEFAULT 0)",
    );
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      ["sr-learn-progress", JSON.stringify({ "c1": sampleProgress })],
    );
    const { migrated } = await migrateLearnProgressToRelational(exec);
    expect(migrated).toBe(1);
    const rows = await exec.all<{ card_id: string }>(
      "SELECT card_id FROM learn_progress",
    );
    expect(rows.map((r) => r.card_id)).toEqual(["c1"]);
    const flag = await exec.all<{ value: string }>(
      "SELECT value FROM kv WHERE key = ?",
      ["learn-progress-relational-v1"],
    );
    expect(flag[0]?.value).toBe("1");
  });

  it("clearLearnProgress removes all rows", async () => {
    const exec = getTestSqlExecutor();
    await exec.run(
      "CREATE TABLE learn_progress (card_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updatedAt INTEGER NOT NULL DEFAULT 0)",
    );
    await replaceAllLearnProgress({ "c1": sampleProgress });
    await clearLearnProgress();
    const loaded = await loadAllLearnProgress();
    expect(Object.keys(loaded)).toHaveLength(0);
  });

  it("storage.ts load/save delegates to SQLite only", async () => {
    const exec = getTestSqlExecutor();
    await exec.run(
      "CREATE TABLE learn_progress (card_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updatedAt INTEGER NOT NULL DEFAULT 0)",
    );
    await saveLearnProgress({ "card-b": sampleProgress });
    const loaded = await loadLearnProgress();
    expect(loaded["card-b"]).toEqual(sampleProgress);
    expect(localStorage.getItem("sr-learn-progress")).toBeNull();
  });

  it("resetCardLearningProgress clears isEndangered", () => {
    const card = makeCard({ isEndangered: true });
    const reset = resetCardLearningProgress(card);
    expect(reset.isEndangered).toBe(false);
  });
});
