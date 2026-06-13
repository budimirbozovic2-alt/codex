/**
 * SQLite test harness — A1c-4 F5.
 *
 * In-memory `SqlExecutor` that covers the SQL surface the production code
 * actually issues: `INSERT [OR REPLACE]`, `DELETE FROM x [WHERE col = ?]`,
 * `UPDATE x SET ...=? WHERE col = ?`, `SELECT [cols] FROM x [WHERE ...]
 * [ORDER BY col ASC|DESC] [LIMIT ?]`, `SELECT COUNT(*) AS n FROM x [WHERE ...]`,
 * plus DDL (`CREATE TABLE/INDEX`, `PRAGMA`, `ALTER`) as no-ops.
 *
 * Transactions use snapshot rollback (single-level), mirroring the existing
 * In-memory SQLite executor for vitest — no legacy IDB migration path.
 *
 * Wired into the global vitest setup via `installSqliteHarness()` which mocks
 * `@/lib/electron-integration` (so `isElectron() === true`) and
 * `@/lib/persistence/sqlite/client` (so `getOpfsSqliteExecutor()` returns the
 * in-memory executor). FSM reset for integration tests that exercise the real
 * client goes through `__resetSqliteClient()` → `__resetSqliteReadyForTests()`.
 * shared in-memory instance). Reset between tests via `resetTestSqliteState()`.
 */
import type {
  SqlBindValue,
  SqlExecutor,
  SqlRow,
} from "@/lib/persistence/sqlite/executor";

type Row = Record<string, SqlBindValue>;

interface TableState {
  rows: Row[];
  /** Next ROWID for AUTOINCREMENT-style PKs. */
  nextRowid: number;
}

interface MockState {
  tables: Map<string, TableState>;
}

function newState(): MockState {
  return { tables: new Map() };
}

function snapshot(state: MockState): MockState {
  const copy = newState();
  for (const [name, t] of state.tables) {
    copy.tables.set(name, {
      rows: t.rows.map((r) => ({ ...r })),
      nextRowid: t.nextRowid,
    });
  }
  return copy;
}

function getOrCreateTable(state: MockState, name: string): TableState {
  let t = state.tables.get(name);
  if (!t) {
    t = { rows: [], nextRowid: 1 };
    state.tables.set(name, t);
  }
  return t;
}

// ─── SQL parsing helpers (deliberately narrow) ───────────────────────────

const RE_INSERT =
  /^\s*INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i;
const RE_DELETE_WHERE = /^\s*DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+?)\s*;?\s*$/i;
const RE_DELETE_ALL = /^\s*DELETE\s+FROM\s+(\w+)\s*;?\s*$/i;
const RE_UPDATE =
  /^\s*UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+?)\s*;?\s*$/i;
const RE_SELECT =
  /^\s*SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\?|\d+))?\s*;?\s*$/i;
const RE_COUNT =
  /^\s*SELECT\s+COUNT\(\*\)\s+AS\s+n\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?\s*;?\s*$/i;

interface WhereClause {
  match: (row: Row) => boolean;
  /** Number of `?` placeholders consumed from the params list. */
  paramCount: number;
}

function parsePayloadObj(row: Row): Record<string, unknown> {
  const raw = row.payload;
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface JsonSetters {
  paramCount: number;
  apply: (row: Row, params: readonly SqlBindValue[]) => void;
}

/** Emulates SQLite json_set/json_remove UPDATE assignments used by cards repo. */
function tryBuildJsonSetters(setClause: string): JsonSetters | null {
  const s = setClause.replace(/\s+/g, " ").trim();

  if (
    /^sourceId = NULL, updatedAt = \?, payload = json_set\( json_remove\( payload, '\$\.sourceId', '\$\.textAnchor', '\$\.needsReview' \), '\$\.updatedAt', \? \)$/i.test(
      s,
    )
  ) {
    return {
      paramCount: 2,
      apply(row, params) {
        row.sourceId = null;
        row.updatedAt = params[0] ?? null;
        const payload = parsePayloadObj(row);
        delete payload.sourceId;
        delete payload.textAnchor;
        delete payload.needsReview;
        payload.updatedAt = params[1];
        row.payload = JSON.stringify(payload);
      },
    };
  }

  if (
    /^updatedAt = \?, payload = json_set\( json_remove\(payload, '\$\.needsReview'\), '\$\.updatedAt', \? \)$/i.test(
      s,
    )
  ) {
    return {
      paramCount: 2,
      apply(row, params) {
        row.updatedAt = params[0] ?? null;
        const payload = parsePayloadObj(row);
        delete payload.needsReview;
        payload.updatedAt = params[1];
        row.payload = JSON.stringify(payload);
      },
    };
  }

  if (
    /^updatedAt = \?, payload = json_set\( json_set\(payload, '\$\.needsReview', json\('true'\)\), '\$\.updatedAt', \? \)$/i.test(
      s,
    )
  ) {
    return {
      paramCount: 2,
      apply(row, params) {
        row.updatedAt = params[0] ?? null;
        const payload = parsePayloadObj(row);
        payload.needsReview = true;
        payload.updatedAt = params[1];
        row.payload = JSON.stringify(payload);
      },
    };
  }

  if (s.startsWith("chapterId = ?, updatedAt = ?, payload = json_set")) {
    return {
      paramCount: 5,
      apply(row, params) {
        row.chapterId = params[0] ?? null;
        row.updatedAt = params[1] ?? null;
        const payload = parsePayloadObj(row);
        payload.chapterId = params[2];
        payload.chapterOrder = params[3];
        payload.updatedAt = params[4];
        row.payload = JSON.stringify(payload);
      },
    };
  }

  return null;
}

function parseWhere(
  where: string,
  params: readonly SqlBindValue[],
  paramOffset: number,
): WhereClause {
  // Split on AND only — production code never uses OR.
  const parts = where.split(/\s+AND\s+/i).map((p) => p.trim());
  const predicates: Array<(row: Row, p: readonly SqlBindValue[]) => boolean> =
    [];
  let consumed = 0;
  for (const part of parts) {
    // col IS NULL
    const isNull = /^(\w+)\s+IS\s+NULL$/i.exec(part);
    if (isNull) {
      const col = isNull[1];
      predicates.push((row) => row[col] === null || row[col] === undefined);
      continue;
    }
    const isNotNull = /^(\w+)\s+IS\s+NOT\s+NULL$/i.exec(part);
    if (isNotNull) {
      const col = isNotNull[1];
      predicates.push((row) => row[col] !== null && row[col] !== undefined);
      continue;
    }
    const jsonExtractNotNull =
      /^json_extract\(payload,\s*'\$\.([^']+)'\)\s+IS\s+NOT\s+NULL$/i.exec(part);
    if (jsonExtractNotNull) {
      const key = jsonExtractNotNull[1];
      predicates.push((row) => {
        const payload = parsePayloadObj(row);
        const v = payload[key];
        return v !== undefined && v !== null;
      });
      continue;
    }
    // col LIKE ?
    const likeMatch = /^(\w+)\s+LIKE\s+\?$/i.exec(part);
    if (likeMatch) {
      const col = likeMatch[1];
      const slot = paramOffset + consumed;
      consumed++;
      predicates.push((row, p) => {
        const v = row[col];
        if (typeof v !== "string") return false;
        const pat = String(p[slot] ?? "");
        // Convert SQL LIKE wildcards to regex.
        const rx = new RegExp(
          "^" +
            pat
              .replace(/[.+^${}()|[\]\\]/g, "\\$&")
              .replace(/%/g, ".*")
              .replace(/_/g, ".") +
            "$",
          "i",
        );
        return rx.test(v);
      });
      continue;
    }
    // TRIM(col) = ? COLLATE NOCASE  (case-insensitive, trimmed equality)
    const trimNocase =
      /^TRIM\((\w+)\)\s*=\s*\?\s+COLLATE\s+NOCASE$/i.exec(part);
    if (trimNocase) {
      const col = trimNocase[1];
      const slot = paramOffset + consumed;
      consumed++;
      predicates.push((row, p) => {
        const v = row[col];
        if (typeof v !== "string") return false;
        const needle = String(p[slot] ?? "");
        return v.trim().toLowerCase() === needle.trim().toLowerCase();
      });
      continue;
    }
    // col = ?  /  col IS ?  /  col != ?
    const eqMatch = /^(\w+)\s*(=|!=|<>|<=|>=|<|>)\s*\?$/i.exec(part);
    if (eqMatch) {
      const col = eqMatch[1];
      const op = eqMatch[2];
      const slot = paramOffset + consumed;
      consumed++;
      predicates.push((row, p) => {
        const a = row[col];
        const b = p[slot];
        if (a === undefined || a === null || b === undefined || b === null) {
          return op === "=" ? a === b : op === "!=" || op === "<>"
            ? a !== b
            : false;
        }
        switch (op) {
          case "=":
            return a === b;
          case "!=":
          case "<>":
            return a !== b;
          case "<":
            return (a as number) < (b as number);
          case ">":
            return (a as number) > (b as number);
          case "<=":
            return (a as number) <= (b as number);
          case ">=":
            return (a as number) >= (b as number);
        }
        return false;
      });
      continue;
    }
    // col = literal (no placeholder)
    const eqLit = /^(\w+)\s*=\s*('([^']*)'|(\d+))$/i.exec(part);
    if (eqLit) {
      const col = eqLit[1];
      const lit = eqLit[3] !== undefined ? eqLit[3] : Number(eqLit[4]);
      predicates.push((row) => row[col] === lit);
      continue;
    }
    // col IN (?,?,...) — needed for bulkPatch / bulk-read by ids
    const inMatch = /^(\w+)\s+IN\s+\((\?(?:\s*,\s*\?)*)\)$/i.exec(part);
    if (inMatch) {
      const col = inMatch[1];
      const placeholderCount = (inMatch[2].match(/\?/g) ?? []).length;
      const slotStart = paramOffset + consumed;
      consumed += placeholderCount;
      predicates.push((row, p) => {
        const val = row[col];
        for (let i = slotStart; i < slotStart + placeholderCount; i++) {
          if (val === p[i]) return true;
        }
        return false;
      });
      continue;
    }
    throw new Error(`[sqlite-harness] unsupported WHERE clause: ${part}`);
  }
  return {
    match: (row) => predicates.every((p) => p(row, params)),
    paramCount: consumed,
  };
}

function applyOrderBy(rows: Row[], orderBy: string | undefined): Row[] {
  if (!orderBy) return rows;
  const parts = orderBy.split(",").map((p) => p.trim());
  return [...rows].sort((a, b) => {
    for (const part of parts) {
      const m = /^(\w+)(?:\s+(ASC|DESC))?$/i.exec(part);
      if (!m) continue;
      const col = m[1];
      const dir = (m[2] ?? "ASC").toUpperCase() === "DESC" ? -1 : 1;
      const av = a[col];
      const bv = b[col];
      if (av === bv) continue;
      if (av === null || av === undefined) return -1 * dir;
      if (bv === null || bv === undefined) return 1 * dir;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    }
    return 0;
  });
}

function applyLimit(
  rows: Row[],
  limit: string | undefined,
  params: readonly SqlBindValue[],
  paramOffset: number,
): Row[] {
  if (!limit) return rows;
  const n = limit === "?" ? Number(params[paramOffset]) : Number(limit);
  return rows.slice(0, n);
}

// ─── Executor implementation ─────────────────────────────────────────────

class TestExecutor implements SqlExecutor {
  constructor(private state: MockState) {}

  // For nested transactions snapshot stack.
  private snapStack: MockState[] = [];

  async run(
    sql: string,
    params: readonly SqlBindValue[] = [],
  ): Promise<void> {
    const trimmed = sql.replace(/\s+/g, " ").trim();

    // DDL / PRAGMA / ALTER / BEGIN/COMMIT/ROLLBACK — noop. (BEGIN/COMMIT are
    // also invoked through `transaction()`, which is the documented contract.)
    if (
      /^\s*(CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)|PRAGMA\s+|ALTER\s+|DROP\s+(TABLE|INDEX)|BEGIN|COMMIT|ROLLBACK|END)\b/i.test(
        trimmed,
      )
    ) {
      return;
    }

    const ins = RE_INSERT.exec(trimmed);
    if (ins) {
      const table = ins[1];
      const cols = ins[2].split(",").map((c) => c.trim());
      const placeholders = ins[3].split(",").map((p) => p.trim());
      const t = getOrCreateTable(this.state, table);
      const row: Row = {};
      for (let i = 0; i < cols.length; i++) {
        const ph = placeholders[i];
        if (ph === "?") {
          row[cols[i]] = params[i] ?? null;
        } else if (/^\d+$/.test(ph)) {
          row[cols[i]] = Number(ph);
        } else if (ph.toUpperCase() === "NULL") {
          row[cols[i]] = null;
        } else {
          // strip surrounding quotes if literal
          row[cols[i]] = ph.replace(/^'|'$/g, "");
        }
      }
      // Auto-assign id when omitted (AUTOINCREMENT semantics)
      if (!cols.includes("id")) {
        row.id = t.nextRowid++;
      } else if (typeof row.id === "number" && row.id >= t.nextRowid) {
        t.nextRowid = (row.id as number) + 1;
      }
      // OR REPLACE on PK ("id" or "key" or "date" depending on table)
      const isOrReplace = /INSERT\s+OR\s+REPLACE/i.test(trimmed);
      const pkCol = cols.includes("id")
        ? "id"
        : cols.includes("key")
          ? "key"
          : cols.includes("date")
            ? "date"
            : null;
      if (isOrReplace && pkCol) {
        const pkVal = row[pkCol];
        const idx = t.rows.findIndex((r) => r[pkCol] === pkVal);
        if (idx >= 0) {
          t.rows[idx] = row;
          return;
        }
      }
      t.rows.push(row);
      return;
    }

    const delWhere = RE_DELETE_WHERE.exec(trimmed);
    if (delWhere) {
      const table = delWhere[1];
      const t = this.state.tables.get(table);
      if (!t) return;
      const where = parseWhere(delWhere[2], params, 0);
      t.rows = t.rows.filter((r) => !where.match(r));
      return;
    }

    const delAll = RE_DELETE_ALL.exec(trimmed);
    if (delAll) {
      const t = this.state.tables.get(delAll[1]);
      if (t) t.rows = [];
      return;
    }

    const upd = RE_UPDATE.exec(trimmed);
    if (upd) {
      const table = upd[1];
      const setClause = upd[2];
      const whereClause = upd[3];
      const t = this.state.tables.get(table);
      if (!t) return;
      const normalizedSet = setClause.replace(/\s+/g, " ");
      const jsonSetters = tryBuildJsonSetters(normalizedSet);
      if (jsonSetters) {
        const where = parseWhere(whereClause, params, jsonSetters.paramCount);
        for (const row of t.rows) {
          if (where.match(row)) {
            jsonSetters.apply(row, params);
          }
        }
        return;
      }
      const sets = setClause.split(",").map((s) => s.trim());
      const setters: Array<(row: Row, p: readonly SqlBindValue[]) => void> = [];
      let consumed = 0;
      for (const s of sets) {
        const m = /^(\w+)\s*=\s*(\?|NULL|'([^']*)'|(-?\d+))$/i.exec(s);
        if (!m) throw new Error(`[sqlite-harness] unsupported SET: ${s}`);
        const col = m[1];
        if (m[2] === "?") {
          const slot = consumed++;
          setters.push((row, p) => {
            row[col] = p[slot] ?? null;
          });
        } else if (/^NULL$/i.test(m[2])) {
          setters.push((row) => {
            row[col] = null;
          });
        } else if (m[3] !== undefined) {
          setters.push((row) => {
            row[col] = m[3];
          });
        } else {
          setters.push((row) => {
            row[col] = Number(m[4]);
          });
        }
      }
      const where = parseWhere(whereClause, params, consumed);
      for (const row of t.rows) {
        if (where.match(row)) {
          for (const set of setters) set(row, params);
        }
      }
      return;
    }

    throw new Error(`[sqlite-harness] unsupported SQL: ${trimmed}`);
  }

  async all<T = SqlRow>(
    sql: string,
    params: readonly SqlBindValue[] = [],
  ): Promise<T[]> {
    // Normalize whitespace (incl. newlines) so multi-line SQL strings — used
    // by `findArticleByTitle` and friends — match the single-line regexes.
    const trimmed = sql.replace(/\s+/g, " ").trim();

    const count = RE_COUNT.exec(trimmed);
    if (count) {
      const t = this.state.tables.get(count[1]);
      if (!t) return [{ n: 0 } as unknown as T];
      if (count[2]) {
        const where = parseWhere(count[2], params, 0);
        const n = t.rows.filter((r) => where.match(r)).length;
        return [{ n } as unknown as T];
      }
      return [{ n: t.rows.length } as unknown as T];
    }

    const sel = RE_SELECT.exec(trimmed);
    if (sel) {
      const colsRaw = sel[1].trim();
      const table = sel[2];
      const whereStr = sel[3];
      const orderBy = sel[4];
      const limit = sel[5];
      const t = this.state.tables.get(table);
      if (!t) return [];
      let consumed = 0;
      let rows = t.rows;
      if (whereStr) {
        const where = parseWhere(whereStr, params, 0);
        consumed = where.paramCount;
        rows = rows.filter((r) => where.match(r));
      }
      rows = applyOrderBy(rows, orderBy);
      rows = applyLimit(rows, limit, params, consumed);
      // Column projection.
      if (colsRaw === "*") {
        return rows.map((r) => ({ ...r })) as unknown as T[];
      }
      const cols = colsRaw.split(",").map((c) => c.trim());
      return rows.map((r) => {
        const out: Row = {};
        for (const c of cols) {
          // Handle "col AS alias" — but production code uses bare cols for SELECT.
          const aliasM = /^(\w+)(?:\s+AS\s+(\w+))?$/i.exec(c);
          if (aliasM) {
            const src = aliasM[1];
            const dst = aliasM[2] ?? src;
            out[dst] = r[src] ?? null;
          }
        }
        return out;
      }) as unknown as T[];
    }

    throw new Error(`[sqlite-harness] unsupported SELECT: ${trimmed}`);
  }

  async runMany(
    sql: string,
    paramsBatches: readonly (readonly SqlBindValue[])[],
  ): Promise<void> {
    for (const params of paramsBatches) await this.run(sql, params);
  }

  async exec(sql: string): Promise<void> {
    // Multi-statement DDL — split and noop each. Only handle CREATE/PRAGMA.
    const stmts = sql.split(";").map((s) => s.trim()).filter(Boolean);
    for (const s of stmts) {
      if (
        /^\s*(CREATE|PRAGMA|ALTER|DROP|BEGIN|COMMIT|ROLLBACK|END)\b/i.test(s)
      ) {
        continue;
      }
      await this.run(s);
    }
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    this.snapStack.push(snapshot(this.state));
    try {
      const result = await fn(this);
      this.snapStack.pop();
      return result;
    } catch (err) {
      const snap = this.snapStack.pop();
      if (snap) {
        this.state.tables = snap.tables;
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    /* noop */
  }
}

// ─── Singleton wiring ────────────────────────────────────────────────────

let _state: MockState = newState();
let _executor: TestExecutor = new TestExecutor(_state);

export function getTestSqlExecutor(): SqlExecutor {
  return _executor;
}

export function resetTestSqliteState(): void {
  _state = newState();
  _executor = new TestExecutor(_state);
}

/** Direct table access for assertions in tests. */
export function getTestSqliteTable(name: string): Row[] {
  return _state.tables.get(name)?.rows ?? [];
}

/** Seed a table directly (bypasses SQL parser) — useful in test setUp. */
export function seedTestSqliteTable(name: string, rows: Row[]): void {
  const t = getOrCreateTable(_state, name);
  t.rows.push(...rows.map((r) => ({ ...r })));
  for (const r of rows) {
    if (typeof r.id === "number" && r.id >= t.nextRowid) {
      t.nextRowid = (r.id as number) + 1;
    }
  }
}

/**
 * Vitest wiring lives in `src/test/setup.ts` (vi.mock + beforeEach reset).
 */
export function installSqliteHarness(): void {
  resetTestSqliteState();
}
