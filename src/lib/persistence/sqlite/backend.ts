/**
 * SQLite storage backend selection (Faza 5.4).
 *
 * Electron uses main-process better-sqlite3 exclusively.
 */
export type SqliteBackend = "main";

export function resolveSqliteBackend(): SqliteBackend {
  return "main";
}

export function canUseMainSqliteBackend(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(
      (window as Window & { electronAPI?: { sqliteRpc?: unknown } }).electronAPI
        ?.sqliteRpc,
    )
  );
}
