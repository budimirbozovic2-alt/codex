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
  userVersion: number;
}

function newState(): MockState {
  return { tables: new Map(), userVersion: 0 };
}

function snapshot(state: MockState): MockState {
  const copy = newState();
  copy.userVersion = state.userVersion;
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
const RE_COUNT_DISTINCT =
  /^\s*SELECT\s+COUNT\s*\(\s*DISTINCT\s+(\w+)\s*\)\s+AS\s+n\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?\s*;?\s*$/i;
const RE_UPSERT_CARD_SECTIONS =
  /^\s*INSERT\s+INTO\s+card_sections\b[\s\S]+ON\s+CONFLICT\s*\(\s*card_id\s*,\s*section_id\s*\)\s*DO\s+UPDATE\s+SET/i;
const RE_DUE_CARDS_JOIN =
  /^\s*SELECT\s+cards\.[\s\S]+\s+FROM\s+cards\s+INNER\s+JOIN\s+card_sections\s+sec\s+ON\s+cards\.id\s*=\s*sec\.card_id\s+WHERE\s+sec\.state\s*!=\s*\?\s+AND\s+sec\.next_review\s*<=\s*\?\s+GROUP\s+BY\s+cards\.id\s+ORDER\s+BY\s+MIN\s*\(\s*sec\.next_review\s*\)\s+ASC\s+LIMIT\s*\?\s*$/i;
const RE_COUNT_DUE_BY_CATEGORY =
  /^\s*SELECT\s+COUNT\s*\(\s*DISTINCT\s+sec\.card_id\s*\)\s+AS\s+n\s+FROM\s+card_sections\s+sec\s+INNER\s+JOIN\s+cards\s+c\s+ON\s+c\.id\s*=\s*sec\.card_id\s+WHERE\s+c\.categoryId\s*=\s*\?\s+AND\s+sec\.state\s*!=\s*\?\s+AND\s+sec\.next_review\s*<=\s*\?\s*$/i;
const RE_SQLITE_MASTER_TABLE =
  /^\s*SELECT\s+COUNT\(\*\)\s+AS\s+n\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*\?\s*$/i;
const RE_AVG_MASTERY_BY_CATEGORY =
  /^\s*SELECT\s+ROUND\s*\(\s*AVG\s*\(\s*mastery_score\s*\)\s*\)\s+AS\s+score\s+FROM\s+cards\s+WHERE\s+categoryId\s*=\s*\?\s*$/i;
const RE_MASTERY_DIST_BY_CATEGORY =
  /^\s*SELECT\s+mastery_level,\s+COUNT\(\*\)\s+AS\s+n\s+FROM\s+cards\s+WHERE\s+categoryId\s*=\s*\?\s+GROUP\s+BY\s+mastery_level\s*$/i;

function applyCardSectionsUpsert(
  state: MockState,
  params: readonly SqlBindValue[],
): void {
  const t = getOrCreateTable(state, "card_sections");
  const row: Row = {
    card_id: params[0] ?? null,
    section_id: params[1] ?? null,
    state: params[2] ?? null,
    stability: params[3] ?? null,
    difficulty: params[4] ?? null,
    interval_days: params[5] ?? null,
    next_review: params[6] ?? null,
    last_reviewed: params[7] ?? null,
    lapses: params[8] ?? null,
    elapsed_days: params[9] ?? null,
    scheduled_days: params[10] ?? null,
    first_review_pending: params[11] ?? null,
  };
  const idx = t.rows.findIndex(
    (r) => r.card_id === row.card_id && r.section_id === row.section_id,
  );
  if (idx >= 0) {
    t.rows[idx] = row;
  } else {
    t.rows.push(row);
  }
}

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

  // TD-ZK-1 — attach concept link: linkedArticleId column + payload.
  if (
    /^linkedArticleId = \?, updatedAt = \?, payload = json_set\(payload, '\$\.linkedArticleId', \?, '\$\.updatedAt', \?\)$/i.test(
      s,
    )
  ) {
    return {
      paramCount: 4,
      apply(row, params) {
        row.linkedArticleId = params[0] ?? null;
        row.updatedAt = params[1] ?? null;
        const payload = parsePayloadObj(row);
        payload.linkedArticleId = params[2];
        payload.updatedAt = params[3];
        row.payload = JSON.stringify(payload);
      },
    };
  }

  // TD-ZK-1 — detach concept link (unlink + article delete cleanup).
  if (
    /^linkedArticleId = NULL, updatedAt = \?, payload = json_set\( json_remove\(payload, '\$\.linkedArticleId'\), '\$\.updatedAt', \?\)$/i.test(
      s,
    )
  ) {
    return {
      paramCount: 2,
      apply(row, params) {
        row.linkedArticleId = null;
        row.updatedAt = params[0] ?? null;
        const payload = parsePayloadObj(row);
        delete payload.linkedArticleId;
        payload.updatedAt = params[1];
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

    const pragmaUserVersionSet = /^\s*PRAGMA\s+user_version\s*=\s*(\d+)\s*$/i.exec(
      trimmed,
    );
    if (pragmaUserVersionSet) {
      this.state.userVersion = Number(pragmaUserVersionSet[1]);
      return;
    }

    // DDL / PRAGMA / ALTER / BEGIN/COMMIT/ROLLBACK — noop. (BEGIN/COMMIT are
    // also invoked through `transaction()`, which is the documented contract.)
    if (
      /^\s*(CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)|PRAGMA\s+|ALTER\s+|DROP\s+(TABLE|INDEX)|BEGIN|COMMIT|ROLLBACK|END)\b/i.test(
        trimmed,
      )
    ) {
      return;
    }

    const upsertSections = RE_UPSERT_CARD_SECTIONS.exec(trimmed);
    if (upsertSections) {
      applyCardSectionsUpsert(this.state, params);
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
      // OR REPLACE on PK ("id" or "key" or "date" depending on table)
      const isOrReplace = /INSERT\s+OR\s+REPLACE/i.test(trimmed);
      const pkCol = cols.includes("id")
        ? "id"
        : cols.includes("key")
          ? "key"
          : cols.includes("date")
            ? "date"
            : null;
      if (!cols.includes("id")) {
        row.id = t.nextRowid++;
      } else if (row.id === null || row.id === undefined) {
        row.id = t.nextRowid++;
      } else if (typeof row.id === "number" && row.id >= t.nextRowid) {
        t.nextRowid = (row.id as number) + 1;
      }
      if (isOrReplace && pkCol && row[pkCol] != null) {
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
      const removed =
        table === "cards"
          ? t.rows.filter((r) => where.match(r))
          : [];
      t.rows = t.rows.filter((r) => !where.match(r));
      if (table === "cards" && removed.length > 0) {
        const sec = this.state.tables.get("card_sections");
        if (sec) {
          const ids = new Set(removed.map((r) => r.id));
          sec.rows = sec.rows.filter((r) => !ids.has(r.card_id));
        }
      }
      return;
    }

    const delAll = RE_DELETE_ALL.exec(trimmed);
    if (delAll) {
      const table = delAll[1];
      const t = this.state.tables.get(table);
      if (t) {
        if (table === "cards") {
          const sec = this.state.tables.get("card_sections");
          if (sec) sec.rows = [];
        }
        t.rows = [];
      }
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

    const pragmaUserVersionRead = /^\s*PRAGMA\s+user_version\s*$/i.exec(trimmed);
    if (pragmaUserVersionRead) {
      return [{ user_version: this.state.userVersion }] as unknown as T[];
    }

    const pragmaInfo = /^\s*PRAGMA\s+table_info\((\w+)\)\s*$/i.exec(trimmed);
    if (pragmaInfo) {
      const table = pragmaInfo[1];
      const t = this.state.tables.get(table);
      const sample = t?.rows[0];
      if (sample) {
        return Object.keys(sample).map((name) => ({ name })) as unknown as T[];
      }
      if (table === "cards") {
        return [
          { name: "id" }, { name: "categoryId" }, { name: "subcategoryId" },
          { name: "chapterId" }, { name: "type" }, { name: "createdAt" },
          { name: "updatedAt" }, { name: "sourceId" }, { name: "frequencyTag" },
          { name: "sourceType" }, { name: "mastery_score" }, { name: "mastery_level" },
          { name: "parentId" }, { name: "isEndangered" },
          { name: "linkedArticleId" }, { name: "payload" },
        ] as unknown as T[];
      }
      return [] as unknown as T[];
    }

    const sqliteMasterTable = RE_SQLITE_MASTER_TABLE.exec(trimmed);
    if (sqliteMasterTable) {
      const name = String(params[0] ?? "");
      const n = this.state.tables.has(name) ? 1 : 0;
      return [{ n } as unknown as T];
    }

    const dueJoin = RE_DUE_CARDS_JOIN.exec(trimmed);
    if (dueJoin) {
      const newState = Number(params[0]);
      const nowMs = Number(params[1]);
      const limit = Number(params[2]);
      const cards = this.state.tables.get("cards")?.rows ?? [];
      const idxRows = this.state.tables.get("card_sections")?.rows ?? [];
      const dueByCard = new Map<string, number>();
      for (const idx of idxRows) {
        if (Number(idx.state) === newState) continue;
        if (Number(idx.next_review) > nowMs) continue;
        const cardId = String(idx.card_id);
        const nr = Number(idx.next_review);
        const prev = dueByCard.get(cardId);
        if (prev === undefined || nr < prev) dueByCard.set(cardId, nr);
      }
      const ordered = [...dueByCard.entries()]
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([id]) => id);
      const byId = new Map(cards.map((r) => [String(r.id), r]));
      return ordered
        .map((id) => byId.get(id))
        .filter((r): r is Row => r !== undefined) as unknown as T[];
    }

    const countDueByCategory = RE_COUNT_DUE_BY_CATEGORY.exec(trimmed);
    if (countDueByCategory) {
      const categoryId = String(params[0]);
      const newState = Number(params[1]);
      const nowMs = Number(params[2]);
      const cards = this.state.tables.get("cards")?.rows ?? [];
      const idxRows = this.state.tables.get("card_sections")?.rows ?? [];
      const cardsById = new Map(cards.map((r) => [String(r.id), r]));
      const dueCards = new Set<string>();
      for (const idx of idxRows) {
        if (Number(idx.state) === newState) continue;
        if (Number(idx.next_review) > nowMs) continue;
        const cardId = String(idx.card_id);
        const card = cardsById.get(cardId);
        if (!card || String(card.categoryId) !== categoryId) continue;
        dueCards.add(cardId);
      }
      return [{ n: dueCards.size } as unknown as T];
    }

    const avgMasteryByCategory = RE_AVG_MASTERY_BY_CATEGORY.exec(trimmed);
    if (avgMasteryByCategory) {
      const categoryId = String(params[0]);
      const cards = this.state.tables.get("cards")?.rows ?? [];
      const scores = cards
        .filter((r) => String(r.categoryId) === categoryId)
        .map((r) => Number(r.mastery_score ?? 0));
      if (scores.length === 0) return [{ score: 0 } as unknown as T];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return [{ score: Math.round(avg) } as unknown as T];
    }

    const masteryDistByCategory = RE_MASTERY_DIST_BY_CATEGORY.exec(trimmed);
    if (masteryDistByCategory) {
      const categoryId = String(params[0]);
      const cards = this.state.tables.get("cards")?.rows ?? [];
      const buckets = new Map<number, number>();
      for (const row of cards) {
        if (String(row.categoryId) !== categoryId) continue;
        const level = Number(row.mastery_level ?? 0);
        buckets.set(level, (buckets.get(level) ?? 0) + 1);
      }
      return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([mastery_level, n]) => ({ mastery_level, n })) as unknown as T[];
    }

    const countDistinct = RE_COUNT_DISTINCT.exec(trimmed);
    if (countDistinct) {
      const col = countDistinct[1];
      const table = countDistinct[2];
      const whereStr = countDistinct[3];
      const t = this.state.tables.get(table);
      if (!t) return [{ n: 0 } as unknown as T];
      let rows = t.rows;
      if (whereStr) {
        const where = parseWhere(whereStr, params, 0);
        rows = rows.filter((r) => where.match(r));
      }
      const distinct = new Set(rows.map((r) => r[col]));
      return [{ n: distinct.size } as unknown as T];
    }

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
      if (/^\s*SELECT\s+1\s*$/i.test(s)) {
        continue;
      }
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
        this.state.userVersion = snap.userVersion;
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
  getOrCreateTable(_state, "card_sections");
  _executor = new TestExecutor(_state);
}

/** Opaque handle for in-memory DB snapshot (test-only). */
export type TestSqliteSnapshot = Readonly<{ snap: MockState }>;

/** Capture current harness tables for simulated worker restart. */
export function snapshotTestSqliteState(): TestSqliteSnapshot {
  return { snap: snapshot(_state) };
}

/** Restore harness tables from {@link snapshotTestSqliteState}. */
export function restoreTestSqliteState(handle: TestSqliteSnapshot): void {
  _state = snapshot(handle.snap);
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
