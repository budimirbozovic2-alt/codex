'use strict';

/**
 * Main-process SQLite via better-sqlite3 (Faza 5).
 * Synchronous DB API; IPC layer serializes access from the renderer.
 */
const fs = require('fs');
const path = require('path');

let Database = null;
try {
  // Optional native module — absent in vitest / misbuilt installs.
  Database = require('better-sqlite3');
} catch {
  Database = null;
}

const DB_FILENAME = 'codex-main.sqlite';

/** @type {import('better-sqlite3').Database | null} */
let db = null;
let txCounter = 0;
/** @type {Map<number, string>} */
const savepoints = new Map();

function isAvailable() {
  return Database != null;
}

function getDbPath(userDataPath) {
  return path.join(userDataPath, DB_FILENAME);
}

function assertOpen() {
  if (!db) throw new Error('[sqlite-main] database not open');
}

function normalizeParam(value) {
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

function normalizeParams(params) {
  return (params || []).map(normalizeParam);
}

function openDb(userDataPath) {
  if (!isAvailable()) {
    throw new Error(
      'better-sqlite3 is not available — run npm install and electron-rebuild',
    );
  }
  if (db) {
    return { ok: true, dbPath: getDbPath(userDataPath) };
  }
  const dbPath = getDbPath(userDataPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return { ok: true, dbPath };
}

function closeDb() {
  for (const sp of savepoints.values()) {
    try {
      db?.exec(`ROLLBACK TO ${sp}`);
      db?.exec(`RELEASE ${sp}`);
    } catch {
      /* best-effort */
    }
  }
  savepoints.clear();
  if (db) {
    try {
      db.close();
    } catch {
      /* idempotent */
    }
    db = null;
  }
}

function runSql(sql, params = []) {
  assertOpen();
  const stmt = db.prepare(sql);
  const args = normalizeParams(params);
  if (args.length > 0) stmt.run(...args);
  else stmt.run();
}

function runManySql(sql, batches) {
  assertOpen();
  const stmt = db.prepare(sql);
  const tx = db.transaction((rows) => {
    for (const params of rows) {
      const args = normalizeParams(params);
      if (args.length > 0) stmt.run(...args);
      else stmt.run();
    }
  });
  tx(batches);
}

function allSql(sql, params = []) {
  assertOpen();
  const stmt = db.prepare(sql);
  const args = normalizeParams(params);
  const rows = args.length > 0 ? stmt.all(...args) : stmt.all();
  return rows;
}

function execSql(sql) {
  assertOpen();
  db.exec(sql);
}

function beginTx() {
  assertOpen();
  const id = ++txCounter;
  const sp = `codex_sp_${id}`;
  db.exec(`SAVEPOINT ${sp}`);
  savepoints.set(id, sp);
  return id;
}

function commitTx(txId) {
  assertOpen();
  const sp = savepoints.get(txId);
  if (!sp) throw new Error(`[sqlite-main] unknown txId=${txId}`);
  db.exec(`RELEASE ${sp}`);
  savepoints.delete(txId);
}

function rollbackTx(txId) {
  if (!db) return;
  const sp = savepoints.get(txId);
  if (!sp) return;
  try {
    db.exec(`ROLLBACK TO ${sp}`);
    db.exec(`RELEASE ${sp}`);
  } catch {
    /* txn may already be closed */
  }
  savepoints.delete(txId);
}

module.exports = {
  isAvailable,
  openDb,
  closeDb,
  runSql,
  runManySql,
  allSql,
  execSql,
  beginTx,
  commitTx,
  rollbackTx,
};
