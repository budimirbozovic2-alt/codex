/**
 * migrateFromIdb (Phase C): raw IDB reader + SQLite executor. The legacy
 * Dexie shell is gone — we mock `@/lib/persistence/sqlite/idb-raw-reader`
 * instead. SQLite side is an in-memory executor that honours
 * BEGIN/COMMIT/ROLLBACK so the count-check abort path can be exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SqlBindValue, SqlExecutor, SqlRow } from "@/lib/persistence/sqlite/executor";

// ── Raw IDB reader mock ───────────────────────────────────────────────────
type StoreName =
  | "categories" | "sources" | "cards" | "mindMaps" | "mnemonics"
  | "knowledgeBaseArticles" | "majorSystem" | "mnemonicTestLog"
  | "settings" | "disciplineLog" | "drafts";

const stores: Record<StoreName, unknown[]> = {
  categories: [
    { id: "c1", name: "Cat 1", sortOrder: 0 },
    { id: "c2", name: "Cat 2", sortOrder: 1 },
  ],
  sources: [{ id: "s1", categoryId: "c1", title: "S1" }],
  cards: [
    { id: "k1", question: "Q1", sections: [], categoryId: "c1", createdAt: 1, readCount: 0, type: "essay" },
    { id: "k2", question: "Q2", sections: [], categoryId: "c1", createdAt: 2, readCount: 0, type: "essay" },
    { id: "k3", question: "Q3", sections: [], categoryId: "c2", createdAt: 3, readCount: 0, type: "essay" },
  ],
  mindMaps: [],
  mnemonics: [],
  knowledgeBaseArticles: [],
  majorSystem: [],
  mnemonicTestLog: [],
  settings: [],
  disciplineLog: [],
  drafts: [],
};

/** Tests can populate this to force `listAllRows(<store>)` to reject. */
const throwOnList = new Set<StoreName>();

const fakeIdb = { __fake: true } as unknown as IDBDatabase;

vi.mock("@/lib/persistence/sqlite/idb-raw-reader", () => ({
  openLegacyIdb: async () => fakeIdb,
  streamStore: async <T,>(
    _db: IDBDatabase,
    name: StoreName,
    onPage: (rows: T[]) => Promise<void>,
    pageSize = 500,
  ) => {
    const rows = (stores[name] ?? []) as T[];
    let total = 0;
    for (let i = 0; i < rows.length; i += pageSize) {
      const page = rows.slice(i, i + pageSize);
      await onPage(page);
      total += page.length;
    }
    return total;
  },
  listAllRows: async <T,>(_db: IDBDatabase, name: StoreName) => {
    if (throwOnList.has(name)) throw new Error(`forced fail: ${name}`);
    return (stores[name] ?? []) as T[];
  },
  getKv: async <T,>(_db: IDBDatabase, _name: StoreName, _key: string) => undefined as T | undefined,
}));

// ── In-memory SqlExecutor honouring tx semantics ──────────────────────────
interface MockState {
  tables: Record<string, Map<string, unknown[]>>;
  kv: Map<string, string>;
  snapshot: { tables: Record<string, Map<string, unknown[]>>; kv: Map<string, string> } | null;
  inTx: boolean;
}

function createExecutor(): SqlExecutor {
  const state: MockState = {
    tables: { cards: new Map(), categories: new Map(), sources: new Map(), mindMaps: new Map(), mnemonics: new Map(), knowledgeBaseArticles: new Map(), majorSystem: new Map(), mnemonicTestLog: new Map() },
    kv: new Map(),
    snapshot: null,
    inTx: false,
  };

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
  const runMany: SqlExecutor["runMany"] = async (sql, batches) => {
    for (const p of batches) handleInsert(sql, p);
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
      const result = await fn({
        run: (sql, params) => api.run(sql, params),
        runMany: (sql, batches) => api.runMany(sql, batches),
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

  const api: SqlExecutor = { run, runMany, all, exec, transaction, close };

  (api.run as unknown as { _state: MockState; _setDropFilter: typeof setDropFilter })._state = state;
  (api.run as unknown as { _setDropFilter: typeof setDropFilter })._setDropFilter = setDropFilter;
  return api;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("migrateFromIdb", () => {
  it("copies every legacy store and writes the migration flag", async () => {
    const { migrateFromIdb, MIGRATION_FLAG_KEY } = await import(
      "@/lib/persistence/sqlite/migrate-from-idb"
    );
    const executor = createExecutor();
    const state = (executor.run as unknown as { _state: MockState })._state;

    const report = await migrateFromIdb(executor);

    expect(report.alreadyComplete).toBe(false);
    expect(report.counts).toEqual({ categories: 2, sources: 1, cards: 3, mindMaps: 0, mnemonics: 0, knowledgeBaseArticles: 0, majorSystem: 0, mnemonicTestLog: 0 });
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
    const setDropFilter = (executor.run as unknown as {
      _setDropFilter: (fn: ((sql: string) => boolean) | null) => void;
    })._setDropFilter;

    let dropped = false;
    setDropFilter((sql) => {
      if (!dropped && /INSERT OR REPLACE INTO cards/i.test(sql)) {
        dropped = true;
        return true;
      }
      return false;
    });

    await expect(migrateFromIdb(executor)).rejects.toBeInstanceOf(MigrationAbort);
    expect(state.tables.cards.size).toBe(0);
    expect(state.kv.has(MIGRATION_FLAG_KEY)).toBe(false);
  });
});
