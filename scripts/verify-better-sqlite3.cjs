'use strict';
try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec('SELECT 1');
  db.close();
  const version = require('better-sqlite3/package.json').version;
  console.log(`better-sqlite3 OK (v${version}) under Electron ${process.versions.electron}`);
  process.exit(0);
} catch (err) {
  console.error('better-sqlite3 FAILED:', err);
  process.exit(1);
}
