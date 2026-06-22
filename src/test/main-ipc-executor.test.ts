import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  __resetMainIpcClientForTests,
  getMainSqlExecutor,
  initMainSqlite,
} from "@/lib/persistence/sqlite/main-ipc-client";

describe("main-ipc-client SqlExecutor", () => {
  const sqliteRpc = vi.fn();

  beforeEach(() => {
    __resetMainIpcClientForTests();
    (window as Window & { electronAPI?: { sqliteRpc: typeof sqliteRpc } })
      .electronAPI = { sqliteRpc };
    sqliteRpc.mockReset();
  });

  afterEach(() => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it("initMainSqlite opens DB via IPC", async () => {
    sqliteRpc.mockResolvedValueOnce({
      ok: true,
      result: { ok: true, dbPath: "/tmp/codex-main.sqlite" },
    });

    const result = await initMainSqlite();
    expect(result).toEqual({ ok: true, dbPath: "/tmp/codex-main.sqlite" });
    expect(sqliteRpc).toHaveBeenCalledWith({ op: "open" });
  });

  it("forwards run/all through sqliteRpc", async () => {
    sqliteRpc
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, result: [{ n: 1 }] });

    const exec = getMainSqlExecutor();
    await exec.run("INSERT INTO t VALUES (?)", [1]);
    const rows = await exec.all<{ n: number }>("SELECT n FROM t");

    expect(sqliteRpc).toHaveBeenNthCalledWith(1, {
      op: "run",
      sql: "INSERT INTO t VALUES (?)",
      params: [1],
      txId: undefined,
    });
    expect(sqliteRpc).toHaveBeenNthCalledWith(2, {
      op: "all",
      sql: "SELECT n FROM t",
      params: [],
      txId: undefined,
    });
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("wraps transaction begin/commit", async () => {
    sqliteRpc
      .mockResolvedValueOnce({ ok: true, result: 7 })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    const exec = getMainSqlExecutor();
    await exec.transaction(async (tx) => {
      await tx.run("UPDATE t SET n = 2");
    });

    expect(sqliteRpc).toHaveBeenNthCalledWith(1, { op: "begin" });
    expect(sqliteRpc).toHaveBeenNthCalledWith(2, {
      op: "run",
      sql: "UPDATE t SET n = 2",
      params: [],
      txId: 7,
    });
    expect(sqliteRpc).toHaveBeenNthCalledWith(3, { op: "commit", txId: 7 });
  });
});
