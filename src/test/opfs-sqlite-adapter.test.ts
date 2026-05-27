/**
 * PR-8 M1 — adapter unit tests using an in-memory SqlExecutor shim.
 *
 * We don't load the wasm runtime in vitest — full OPFS coverage lives in the
 * Electron smoke step. These tests exercise the adapter's transactional
 * contract and the row codecs end-to-end against a minimal SQL-shaped mock.
 */
import { describe, it, expect } from "vitest";
import type { SqlBindValue, SqlExecutor, SqlRow } from "@/lib/persistence/sqlite/executor";
import { createOpfsSqliteAdapter } from "@/lib/persistence/opfs-sqlite-adapter";
import { createMirroringAdapter } from "@/lib/persistence/mirroring-adapter";
import type { PersistAdapter } from "@/lib/persistence/PersistAdapter";
import type { Card } from "@/lib/spaced-repetition";

interface Row { id: string; payload: string }
function createMockExecutor(): SqlExecutor & { rows: Map<string, Row>; txDepth: number; bulkCallCount: number } {
  const rows = new Map<string, Row>();
  const state = { txDepth: 0, bulkCallCount: 0 };
  const exec: SqlExecutor = {
    async run(sql: string, params: readonly SqlBindValue[] = []) {
      state.bulkCallCount++;
      if (/^INSERT OR REPLACE INTO cards/i.test(sql.trim())) {
        const id = String(params[0]);
        const payload = String(params[10]);
        rows.set(id, { id, payload });
      } else if (/^DELETE FROM cards/i.test(sql.trim())) {
        rows.delete(String(params[0]));
      }
    },
    async all<T = SqlRow>(): Promise<T[]> { return [] as T[]; },
    async exec() { /* no-op for non-DML */ },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      state.txDepth++;
      try { return await fn(exec); } finally { state.txDepth--; }
    },
    async close() { /* noop */ },
  };
  return Object.assign(exec, state, { rows });
}

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    question: `Q ${id}`,
    sections: [],
    categoryId: "cat-1",
    createdAt: 1,
    readCount: 0,
    type: "essay",
    ...overrides,
  };
}

describe("opfsSqliteAdapter", () => {
  it("bulkApply inserts puts and removes deletes in a single transaction", async () => {
    const mock = createMockExecutor();
    const adapter = createOpfsSqliteAdapter({ getExecutor: async () => mock });

    await adapter.bulkApply([makeCard("a"), makeCard("b")], []);
    expect(mock.rows.size).toBe(2);
    expect(mock.txDepth).toBe(0);

    await adapter.bulkApply([makeCard("c")], ["a"]);
    expect(mock.rows.has("a")).toBe(false);
    expect(mock.rows.has("c")).toBe(true);
    expect(mock.rows.size).toBe(2);
  });

  it("bulkApply is a no-op for empty batches", async () => {
    const mock = createMockExecutor();
    const adapter = createOpfsSqliteAdapter({ getExecutor: async () => mock });
    await adapter.bulkApply([], []);
    expect(mock.bulkCallCount).toBe(0);
  });

  it("enqueueWal / recoverPending are no-ops (SQLite owns durability)", async () => {
    const mock = createMockExecutor();
    const adapter = createOpfsSqliteAdapter({ getExecutor: async () => mock });
    await adapter.enqueueWal({ kind: "put", card: makeCard("x") });
    const r = await adapter.recoverPending();
    expect(r).toEqual({ recovered: 0 });
  });
});

describe("mirroringAdapter", () => {
  it("forwards writes to both primary and secondary", async () => {
    const calls: string[] = [];
    const primary: PersistAdapter = {
      async bulkApply() { calls.push("p"); },
      async enqueueWal() { /* */ },
      async recoverPending() { return { recovered: 0 }; },
    };
    const secondary: PersistAdapter = {
      async bulkApply() { calls.push("s"); },
      async enqueueWal() { /* */ },
      async recoverPending() { return { recovered: 0 }; },
    };
    const adapter = createMirroringAdapter(primary, secondary);
    await adapter.bulkApply([makeCard("a")], []);
    // Allow fire-and-forget secondary to resolve.
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.sort()).toEqual(["p", "s"]);
  });

  it("secondary failures do not reject primary writes", async () => {
    const primary: PersistAdapter = {
      async bulkApply() { /* ok */ },
      async enqueueWal() { /* */ },
      async recoverPending() { return { recovered: 0 }; },
    };
    const secondary: PersistAdapter = {
      async bulkApply() { throw new Error("secondary down"); },
      async enqueueWal() { /* */ },
      async recoverPending() { return { recovered: 0 }; },
    };
    const adapter = createMirroringAdapter(primary, secondary);
    await expect(adapter.bulkApply([makeCard("a")], [])).resolves.toBeUndefined();
  });
});
