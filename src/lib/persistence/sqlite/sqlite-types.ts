/**
 * Type definitions for SQLite WASM API surfaces.
 * Extracted to avoid circular imports between client.ts and sqlite-init.ts.
 */

export interface SqliteDb {
  exec(opts: {
    sql: string;
    bind?: readonly (string | number | null | boolean | Uint8Array)[];
    rowMode?: "object";
    returnValue?: "resultRows";
  }): unknown;
  close(): void;
}

export interface OpfsSAHPool {
  OpfsSAHPoolDb: new (filename: string) => SqliteDb;
}

export interface Sqlite3Wasm {
  installOpfsSAHPoolVfs?: (opts?: { name?: string }) => Promise<OpfsSAHPool>;
  oo1?: { DB: new (filename: string, flags?: string) => SqliteDb };
}

export type SqliteApi = Sqlite3Wasm;
