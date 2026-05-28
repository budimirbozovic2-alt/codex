/**
 * PR-8 M1 — adapter unit tests using an in-memory SqlExecutor shim.
 *
 * We don't load the wasm runtime in vitest — full OPFS coverage lives in the
 * Electron smoke step. These tests exercise the adapter's transactional
 * contract and the row codecs end-to-end against a minimal SQL-shaped mock.
 *
 * The mirroring adapter was retired in A1c-4 (SQLite is the only backend),
 * so this file now only covers the OPFS adapter.
 */
import { describe, it, expect } from "vitest";
import type { SqlBindValue, SqlExecutor, SqlRow } from "@/lib/persistence/sqlite/executor";
import { createOpfsSqliteAdapter } from "@/lib/persistence/opfs-sqlite-adapter";
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
    async runMany(sql: string, batches: readonly (readonly SqlBindValue[])[]) {
      for (const p of batches) await exec.run(sql, p);
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
});
