import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";

const mainMocks = vi.hoisted(() => ({
  initMainSqlite: vi.fn(),
  getMainSqlExecutor: vi.fn(),
}));

const migrationMocks = vi.hoisted(() => ({
  runMigrations: vi.fn(async () => ({ from: 0, to: 16 })),
}));

vi.mock("@/lib/persistence/sqlite/main-ipc-client", () => mainMocks);
vi.mock("@/lib/persistence/sqlite/migration-runner", () => migrationMocks);

import {
  __resetSqliteReadyForTests,
  ensureSqliteReady,
  getLastSqliteBootSummary,
  getSqliteReadyState,
} from "@/lib/persistence/sqlite/readyMachine";

describe("readyMachine (Faza 5.4)", () => {
  const mainExec: SqlExecutor = {
    all: vi.fn(async () => []),
    run: vi.fn(async () => {}),
    runMany: vi.fn(async () => {}),
    exec: vi.fn(async () => {}),
    transaction: vi.fn(async <T,>(fn: (tx: SqlExecutor) => Promise<T>) =>
      fn(mainExec),
    ),
    close: vi.fn(async () => {}),
  };

  beforeEach(() => {
    __resetSqliteReadyForTests();
    (window as Window & { electronAPI?: { sqliteRpc?: unknown } }).electronAPI =
      { sqliteRpc: vi.fn() };
    mainMocks.initMainSqlite.mockReset();
    mainMocks.getMainSqlExecutor.mockReset();
    mainMocks.getMainSqlExecutor.mockReturnValue(mainExec);
    mainMocks.initMainSqlite.mockResolvedValue({
      ok: true,
      dbPath: "C:/Users/test/codex-main.sqlite",
    });
  });

  afterEach(() => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it("opens main backend and records boot summary", async () => {
    const exec = await ensureSqliteReady();

    expect(exec).toBe(mainExec);
    expect(getSqliteReadyState().type).toBe("ready");
    expect(getLastSqliteBootSummary()).toEqual({
      backend: "main",
      dbPath: "C:/Users/test/codex-main.sqlite",
    });
  });

  it("fails fatally when sqliteRpc is unavailable", async () => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;

    await expect(ensureSqliteReady()).rejects.toThrow(/Main-process SQLite unavailable/);
    expect(getSqliteReadyState().type).toBe("fatal");
  });

  it("fails fatally when main open fails", async () => {
    mainMocks.initMainSqlite.mockResolvedValue({ ok: false, dbPath: "" });

    await expect(ensureSqliteReady()).rejects.toThrow(/Main-process SQLite unavailable/);
    expect(getSqliteReadyState().type).toBe("fatal");
  });
});
