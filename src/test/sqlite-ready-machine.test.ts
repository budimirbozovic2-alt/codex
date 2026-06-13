import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";

const mockWorkerExecutor = {
  run: vi.fn(),
  runMany: vi.fn(),
  all: vi.fn(),
  exec: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
} as unknown as SqlExecutor;

const { initWorkerExecutor, getWorkerSqlExecutor } = vi.hoisted(() => ({
  initWorkerExecutor: vi.fn(),
  getWorkerSqlExecutor: vi.fn(() => mockWorkerExecutor),
}));

vi.mock("@/lib/persistence/sqlite/worker-client", () => ({
  initWorkerExecutor,
  getWorkerSqlExecutor,
}));

vi.unmock("@/lib/persistence/sqlite/client");

vi.mock("@/lib/scheduler/taskScheduler", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scheduler/taskScheduler")
  >("@/lib/scheduler/taskScheduler");
  return {
    taskScheduler: {
      ...actual.taskScheduler,
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
    },
  };
});

describe("SQLite ready machine (O-1)", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    delete (window as { electronAPI?: unknown }).electronAPI;
    initWorkerExecutor.mockReset();
    getWorkerSqlExecutor.mockClear();

    const { __resetSqliteReadyForTests } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );
    __resetSqliteReadyForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("idle → opening → ready when OPFS worker succeeds", async () => {
    initWorkerExecutor.mockResolvedValue({
      opfsMode: true,
      diag: { mode: "opfs" },
    });

    const { ensureSqliteReady, getSqliteReadyState } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );

    expect(getSqliteReadyState().type).toBe("idle");

    const pending = ensureSqliteReady();
    expect(getSqliteReadyState().type).toBe("opening");

    const executor = await pending;
    expect(executor).toBe(mockWorkerExecutor);
    expect(getSqliteReadyState().type).toBe("ready");
    expect(initWorkerExecutor).toHaveBeenCalledTimes(1);
  });

  it("OPFS failure → fatal is permanent, subsequent calls re-throw immediately", async () => {
    initWorkerExecutor.mockResolvedValue({
      opfsMode: false,
      initError: "worker init failed",
    });

    const { ensureSqliteReady, getSqliteReadyState } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );

    await expect(ensureSqliteReady()).rejects.toThrow(/FatalError/);
    expect(getSqliteReadyState().type).toBe("fatal");

    initWorkerExecutor.mockResolvedValue({
      opfsMode: true,
      diag: { mode: "opfs" },
    });

    await expect(ensureSqliteReady()).rejects.toThrow(/FatalError/);
    expect(getSqliteReadyState().type).toBe("fatal");
    expect(initWorkerExecutor).toHaveBeenCalledTimes(3);
  });

  it("ensureSqliteReady is idempotent once ready", async () => {
    initWorkerExecutor.mockResolvedValue({
      opfsMode: true,
      diag: {},
    });

    const { ensureSqliteReady } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );

    await ensureSqliteReady();
    await ensureSqliteReady();
    expect(initWorkerExecutor).toHaveBeenCalledTimes(1);
  });

  it("getExecutorOrThrow returns executor when ready, throws when idle", async () => {
    const { ensureSqliteReady, getExecutorOrThrow } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );

    expect(() => getExecutorOrThrow()).toThrow(/SQLite not ready/);

    initWorkerExecutor.mockResolvedValue({ opfsMode: true, diag: {} });
    await ensureSqliteReady();
    expect(getExecutorOrThrow()).toBe(mockWorkerExecutor);
  });
});
