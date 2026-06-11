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

const mockDevExecutor = {
  run: vi.fn(),
  runMany: vi.fn(),
  all: vi.fn(),
  exec: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
} as unknown as SqlExecutor;

const { initWorkerExecutor, getWorkerSqlExecutor, getDevFallbackExecutor } =
  vi.hoisted(() => ({
    initWorkerExecutor: vi.fn(),
    getWorkerSqlExecutor: vi.fn(() => mockWorkerExecutor),
    getDevFallbackExecutor: vi.fn(() => mockDevExecutor),
  }));

vi.mock("@/lib/persistence/sqlite/worker-client", () => ({
  initWorkerExecutor,
  getWorkerSqlExecutor,
}));

vi.mock("@/lib/persistence/sqlite/dev-fallback", () => ({
  getDevFallbackExecutor,
}));

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
  let degradedEvents: CustomEvent[];

  beforeEach(async () => {
    vi.unstubAllEnvs();
    degradedEvents = [];
    vi.spyOn(window, "dispatchEvent").mockImplementation((event) => {
      if (event.type === "db-degraded") {
        degradedEvents.push(event as CustomEvent);
      }
      return true;
    });
    delete (window as { electronAPI?: unknown }).electronAPI;
    initWorkerExecutor.mockReset();
    getWorkerSqlExecutor.mockClear();
    getDevFallbackExecutor.mockClear();

    const { __resetSqliteReadyForTests } = await import(
      "@/lib/persistence/sqlite/readyMachine"
    );
    __resetSqliteReadyForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("idle → opening → ready when OPFS worker succeeds", async () => {
    (window as { electronAPI?: unknown }).electronAPI = {};
    initWorkerExecutor.mockResolvedValue({
      opfsMode: true,
      diag: { mode: "opfs" },
    });

    const {
      ensureSqliteReady,
      getSqliteReadyState,
    } = await import("@/lib/persistence/sqlite/readyMachine");

    expect(getSqliteReadyState().type).toBe("idle");

    const pending = ensureSqliteReady();
    expect(getSqliteReadyState().type).toBe("opening");

    const executor = await pending;
    expect(executor).toBe(mockWorkerExecutor);
    expect(getSqliteReadyState().type).toBe("ready");
    expect(initWorkerExecutor).toHaveBeenCalledTimes(1);
  });

  it("browser DEV → degraded with dev fallback and db-degraded event", async () => {
    const {
      ensureSqliteReady,
      getSqliteReadyState,
    } = await import("@/lib/persistence/sqlite/readyMachine");

    const executor = await ensureSqliteReady();
    expect(executor).toBe(mockDevExecutor);
    expect(getSqliteReadyState().type).toBe("degraded");
    if (getSqliteReadyState().type === "degraded") {
      expect(getSqliteReadyState().reason).toBe(
        "dev-fallback (no Electron, browser DEV)"
      );
    }
    expect(initWorkerExecutor).not.toHaveBeenCalled();
    expect(degradedEvents).toHaveLength(1);
    expect(degradedEvents[0]?.detail?.reason).toBe("opfs-runtime-error");
  });

  it("post-OPFS failure → degraded with two db-degraded events (non-PROD)", async () => {
    (window as { electronAPI?: unknown }).electronAPI = {};
    initWorkerExecutor.mockResolvedValue({
      opfsMode: false,
      initError: "worker init failed",
    });

    const {
      ensureSqliteReady,
      getSqliteReadyState,
    } = await import("@/lib/persistence/sqlite/readyMachine");

    const executor = await ensureSqliteReady();
    expect(executor).toBe(mockDevExecutor);
    expect(getSqliteReadyState().type).toBe("degraded");
    if (getSqliteReadyState().type === "degraded") {
      expect(getSqliteReadyState().reason).toBe(
        "dev-fallback (post-OPFS-failure)"
      );
    }
    expect(initWorkerExecutor).toHaveBeenCalledTimes(3);
    expect(degradedEvents).toHaveLength(2);
    expect(degradedEvents[0]?.detail?.reason).toBe("opfs-runtime-error");
    expect(degradedEvents[1]?.detail?.reason).toBe("opfs-runtime-error");
  });

  it("PROD Electron hard-fail → fatal is permanent, subsequent calls re-throw immediately", async () => {
    vi.stubEnv("PROD", "true");
    (window as { electronAPI?: unknown }).electronAPI = {};
    initWorkerExecutor.mockResolvedValue({
      opfsMode: false,
      initError: "worker init failed",
    });

    const {
      ensureSqliteReady,
      getSqliteReadyState,
    } = await import("@/lib/persistence/sqlite/readyMachine");

    await expect(ensureSqliteReady()).rejects.toThrow(/FatalError/);
    expect(getSqliteReadyState().type).toBe("fatal");

    // Change the mock — but it must NOT be called again. Fatal is a permanent
    // terminal state; ensureSqliteReady() must re-throw the stored error
    // immediately without a new openExecutor() attempt.
    initWorkerExecutor.mockResolvedValue({
      opfsMode: true,
      diag: { mode: "opfs" },
    });

    await expect(ensureSqliteReady()).rejects.toThrow(/FatalError/);
    expect(getSqliteReadyState().type).toBe("fatal");
    // initWorkerExecutor was called only during the first attempt (3 retries),
    // not again for the second ensureSqliteReady() call.
    expect(initWorkerExecutor).toHaveBeenCalledTimes(3);
  });

  it("ensureSqliteReady is idempotent once ready", async () => {
    (window as { electronAPI?: unknown }).electronAPI = {};
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
    const {
      ensureSqliteReady,
      getExecutorOrThrow,
    } = await import("@/lib/persistence/sqlite/readyMachine");

    expect(() => getExecutorOrThrow()).toThrow(/SQLite not ready/);

    (window as { electronAPI?: unknown }).electronAPI = {};
    initWorkerExecutor.mockResolvedValue({ opfsMode: true, diag: {} });
    await ensureSqliteReady();
    expect(getExecutorOrThrow()).toBe(mockWorkerExecutor);
  });
});
