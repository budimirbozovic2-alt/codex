/**
 * PR-8 M2 — migrateFromIdb: paged copy, row-count verification, rollback on
 * mismatch. The Dexie side is mocked via vi.mock; the SQLite side is a small
 * in-memory executor that honours BEGIN/COMMIT/ROLLBACK so the count-check
 * abort path can be exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SqlBindValue, SqlExecutor, SqlRow } from "@/lib/persistence/sqlite/executor";

// ── Dexie mock ─────────────────────────────────────────────────────────────
interface FakeTable<T> {
  rows: T[];
  orderBy(_k: string): { offset(o: number): { limit(n: number): { toArray(): Promise<T[]> } } };
}
function fakeTable<T>(rows: T[]): FakeTable<T> {
  return {
    rows,
    orderBy() {
      return {
        offset(o: number) {
          return {
            limit(n: number) {
              return { toArray: async () => rows.slice(o, o + n) };
            },
          };
        },
      };
    },
  };
}

const fakeDb = {
  categories: fakeTable<{ id: string; name: string; sortOrder: number; color?: string }>([
    { id: "c1", name: "Cat 1", sortOrder: 0 },
    { id: "c2", name: "Cat 2", sortOrder: 1 },
  ]),
  sources: fakeTable<{ id: string; categoryId: string; title: string }>([
    { id: "s1", categoryId: "c1", title: "S1" },
  ]),
  cards: fakeTable<{
    id: string; question: string; sections: []; categoryId: string; createdAt: number;
    readCount: number; type: "essay";
  }>([
    { id: "k1", question: "Q1", sections: [], categoryId: "c1", createdAt: 1, readCount: 0, type: "essay" },
    { id: "k2", question: "Q2", sections: [], categoryId: "c1", createdAt: 2, readCount: 0, type: "essay" },
    { id: "k3", question: "Q3", sections: [], categoryId: "c2", createdAt: 3, readCount: 0, type: "essay" },
  ]),
  mindMaps: fakeTable<{ id: string; categoryId: string; title: string; updatedAt: number }>([]),
  mnemonics: fakeTable<{ id: string; categoryId: string; createdAt: number }>([]),
};

vi.mock("@/lib/db", () => ({ db: fakeDb }));

// ── In-memory SqlExecutor honouring tx semantics ──────────────────────────
interface MockState {
  tables: Record<string, Map<string, unknown[]>>;
  kv: Map<string, string>;
  /** Snapshot stack for nested BEGIN/COMMIT — we only need depth 1 for migration. */
  snapshot: { tables: Record<string, Map<string, unknown[]>>; kv: Map<string, string> } | null;
  inTx: boolean;
}

function createExecutor(): SqlExecutor {
  const state: MockState = {
    tables: { cards: new Map(), categories: new Map(), sources: new Map(), mindMaps: new Map(), mnemonics: new Map() },
    kv: new Map(),
    snapshot: null,
    inTx: false,
  };

  // Test hook: a predicate returning true silently drops that INSERT.
  let dropFilter: ((sql: string, params: readonly SqlBindValue[]) => boolean) | null = null;

  const handleInsert = (sql: string, params: readonly SqlBindValue[]): void => {
    if (dropFilter && dropFilter(sql, params)) return;
    const m = /INSERT OR REPLACE INTO (\w+)/i.exec(sql);
    if (!m) return;
    const tbl = m[1];
    if (tbl === "kv") {
      state.kv.set(String(params[0]), String(params[1]));
      return;
    }
    const map = state.tables[tbl];
    if (map) map.set(String(params[0]), [...params]);
  };

  const run: SqlExecutor["run"] = async (sql, params = []) => {
    handleInsert(sql, params);
  };

  const setDropFilter = (fn: typeof dropFilter): void => { dropFilter = fn; };

  const all: SqlExecutor["all"] = async <T = SqlRow>(sql: string, params: readonly SqlBindValue[] = []) => {
    const countMatch = /SELECT COUNT\(\*\) AS n FROM (\w+)/i.exec(sql);
    if (countMatch) {
      const map = state.tables[countMatch[1]];
      return [{ n: map?.size ?? 0 }] as unknown as T[];
    }
    if (/FROM kv WHERE key/i.test(sql)) {
      const v = state.kv.get(String(params[0]));
      return (v === undefined ? [] : [{ value: v }]) as unknown as T[];
    }
    return [] as T[];
  };

  const exec: SqlExecutor["exec"] = async () => { /* PRAGMA / DDL noop */ };

  const transaction: SqlExecutor["transaction"] = async (fn) => {
    state.snapshot = {
      tables: Object.fromEntries(
        Object.entries(state.tables).map(([k, v]) => [k, new Map(v)]),
      ),
      kv: new Map(state.kv),
    };
    state.inTx = true;
    try {
      // Delegate back to `api` (defined below) so test-time monkey-patching
      // of `api.run` is visible inside the transaction body.
      const result = await fn({
        run: (sql, params) => api.run(sql, params),
        all: (sql, params) => api.all(sql, params),
        exec: (sql) => api.exec(sql),
        transaction: api.transaction,
        close: api.close,
      });
      state.snapshot = null;
      state.inTx = false;
      return result;
    } catch (err) {
      if (state.snapshot) {
        state.tables = state.snapshot.tables;
        state.kv = state.snapshot.kv;
      }
      state.snapshot = null;
      state.inTx = false;
      throw err;
    }
  };

  const close: SqlExecutor["close"] = async () => { /* noop */ };

  const api: SqlExecutor = { run, all, exec, transaction, close };
  (api.run as unknown as { _state: MockState; _setDropFilter: typeof setDropFilter })._state = state;
  (api.run as unknown as { _setDropFilter: typeof setDropFilter })._setDropFilter = setDropFilter;
  return api;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("migrateFromIdb", () => {
  it("copies every Dexie table and writes the migration flag", async () => {
    const { migrateFromIdb, MIGRATION_FLAG_KEY } = await import(
      "@/lib/persistence/sqlite/migrate-from-idb"
    );
    const executor = createExecutor();
    const state = (executor.run as unknown as { _state: MockState })._state;

    const report = await migrateFromIdb(executor);

    expect(report.alreadyComplete).toBe(false);
    expect(report.counts).toEqual({ categories: 2, sources: 1, cards: 3, mindMaps: 0, mnemonics: 0 });
    expect(state.tables.categories.size).toBe(2);
    expect(state.tables.cards.size).toBe(3);
    expect(state.kv.has(MIGRATION_FLAG_KEY)).toBe(true);
  });

  it("is idempotent — second run sees the flag and bails early", async () => {
    const { migrateFromIdb } = await import("@/lib/persistence/sqlite/migrate-from-idb");
    const executor = createExecutor();
    await migrateFromIdb(executor);
    const second = await migrateFromIdb(executor);
    expect(second.alreadyComplete).toBe(true);
  });

  it("rolls back a table tx on row-count mismatch and does NOT write the flag", async () => {
    const { migrateFromIdb, MIGRATION_FLAG_KEY, MigrationAbort } = await import(
      "@/lib/persistence/sqlite/migrate-from-idb"
    );
    const executor = createExecutor();
    const state = (executor.run as unknown as { _state: MockState })._state;

    // Force a count mismatch on `cards` by swallowing one INSERT.
    const realRun = executor.run.bind(executor);
    let dropped = false;
    executor.run = async (sql, params) => {
      if (!dropped && /INSERT OR REPLACE INTO cards/i.test(sql)) {
        dropped = true;
        return; // silently lose this row
      }
      await realRun(sql, params);
    };

    await expect(migrateFromIdb(executor)).rejects.toBeInstanceOf(MigrationAbort);

    // Rollback restored the snapshot → cards table is empty again.
    expect(state.tables.cards.size).toBe(0);
    // Flag was never set, so next boot retries.
    expect(state.kv.has(MIGRATION_FLAG_KEY)).toBe(false);
  });
});
