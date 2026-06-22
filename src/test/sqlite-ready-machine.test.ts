import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";

const mockMainExecutor = {
  run: vi.fn(),
  runMany: vi.fn(),
  all: vi.fn(),
  exec: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
} as unknown as SqlExecutor;

const { initMainSqlite, getMainSqlExecutor } = vi.hoisted(() => ({
  initMainSqlite: vi.fn(),
  getMainSqlExecutor: vi.fn(() => mockMainExecutor),
}));

const { runMigrations } = vi.hoisted(() => ({
  runMigrations: vi.fn(async () => ({ from: 0, to: 16 })),
}));

vi.mock("@/lib/persistence/sqlite/main-ipc-client", () => ({
  initMainSqlite,
  getMainSqlExecutor,
}));

vi.mock("@/lib/persistence/sqlite/migration-runner", () => ({
  runMigrations,
}));

vi.unmock("@/lib/persistence/sqlite/client");

describe("SQLite ready machine (O-1, Faza 5.4)", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    (window as Window & { electronAPI?: { sqliteRpc?: unknown } }).electronAPI =
      { sqliteRpc: vi.fn() };
    initMainSqlite.mockReset();
    getMainSqlExecutor.mockClear();
    runMigrations.mockClear();
    initMainSqlite.mockResolvedValue({
      ok: true,
      dbPath: "/tmp/codex-main.sqlite",
    });

    const { __resetSqliteReadyForTests } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );
    __resetSqliteReadyForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it("idle → opening → ready when main-process SQLite succeeds", async () => {
    const { ensureSqliteReady, getSqliteReadyState } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );

    expect(getSqliteReadyState().type).toBe("idle");

    const pending = ensureSqliteReady();
    expect(getSqliteReadyState().type).toBe("opening");

    const executor = await pending;
    expect(executor).toBe(mockMainExecutor);
    expect(getSqliteReadyState().type).toBe("ready");
    expect(initMainSqlite).toHaveBeenCalledTimes(1);
  });

  it("main failure → fatal is permanent, subsequent calls re-throw immediately", async () => {
    initMainSqlite.mockResolvedValue({ ok: false, dbPath: "" });

    const { ensureSqliteReady, getSqliteReadyState } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );

    await expect(ensureSqliteReady()).rejects.toThrow(/FatalError/);
    expect(getSqliteReadyState().type).toBe("fatal");

    initMainSqlite.mockResolvedValue({
      ok: true,
      dbPath: "/tmp/codex-main.sqlite",
    });

    await expect(ensureSqliteReady()).rejects.toThrow(/FatalError/);
    expect(getSqliteReadyState().type).toBe("fatal");
    expect(initMainSqlite).toHaveBeenCalledTimes(1);
  });

  it("ensureSqliteReady is idempotent once ready", async () => {
    const { ensureSqliteReady } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );

    await ensureSqliteReady();
    await ensureSqliteReady();
    expect(initMainSqlite).toHaveBeenCalledTimes(1);
  });

  it("getExecutorOrThrow returns executor when ready, throws when idle", async () => {
    const { ensureSqliteReady, getExecutorOrThrow } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );

    expect(() => getExecutorOrThrow()).toThrow(/SQLite not ready/);

    await ensureSqliteReady();
    expect(getExecutorOrThrow()).toBe(mockMainExecutor);
  });
});
