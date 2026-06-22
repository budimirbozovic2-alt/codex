'use strict';

const sqliteMain = require('./sqlite-main.cjs');

/**
 * Register `sqlite-rpc` IPC — SqlExecutor surface for renderer.
 */
function setupSqliteIpc({ app, assertTrustedSender, logCrash }) {
  const { ipcMain } = require('electron');

  ipcMain.handle('sqlite-rpc', async (event, payload) => {
    assertTrustedSender(event);
    if (!payload || typeof payload !== 'object') {
      throw new Error('[sqlite-rpc] invalid payload');
    }

    try {
      switch (payload.op) {
        case 'open': {
          if (!sqliteMain.isAvailable()) {
            return {
              ok: false,
              error: 'better-sqlite3 unavailable',
            };
          }
          const result = sqliteMain.openDb(app.getPath('userData'));
          return { ok: true, result };
        }
        case 'run':
          sqliteMain.runSql(payload.sql, payload.params || []);
          return { ok: true };
        case 'runMany':
          sqliteMain.runManySql(payload.sql, payload.batches || []);
          return { ok: true };
        case 'all':
          return {
            ok: true,
            result: sqliteMain.allSql(payload.sql, payload.params || []),
          };
        case 'exec':
          sqliteMain.execSql(payload.sql);
          return { ok: true };
        case 'begin':
          return { ok: true, result: sqliteMain.beginTx() };
        case 'commit':
          sqliteMain.commitTx(payload.txId);
          return { ok: true };
        case 'rollback':
          sqliteMain.rollbackTx(payload.txId);
          return { ok: true };
        case 'shutdown':
          sqliteMain.closeDb();
          return { ok: true };
        default:
          throw new Error(`[sqlite-rpc] unknown op: ${payload.op}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logCrash('sqlite-rpc', err);
      return { ok: false, error: msg };
    }
  });
}

function closeMainSqlite() {
  try {
    sqliteMain.closeDb();
  } catch {
    /* noop */
  }
}

module.exports = { setupSqliteIpc, closeMainSqlite };
