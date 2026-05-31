/**
 * Shared sqlite-wasm initializer.
 *
 * Vite's prebundled `@sqlite.org/sqlite-wasm` resolves `sqlite3.wasm` via
 * `new URL("sqlite3.wasm", import.meta.url)` which, in the dev server,
 * points to `/node_modules/.vite/deps/sqlite3.wasm` — a path the dev server
 * does NOT serve as `application/wasm` (it returns the HTML fallback),
 * causing `WebAssembly.instantiate` to fail with "expected magic word".
 *
 * The fix is to import the wasm as an explicit Vite asset (`?url`) and
 * pass it to the sqlite initializer via `locateFile`. This works in:
 *   • DEV (Vite serves the asset with the right MIME type),
 *   • PROD web (Vite hashes & emits the asset),
 *   • Electron PROD (Vite plugin copies `sqlite3.wasm` into `dist/sqlite/`;
 *     the runtime falls back to that path if `locateFile` returns 404 —
 *     and for Electron PROD the bundled `?url` already resolves correctly).
 */
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";

interface SqliteInitOpts {
  locateFile?: (file: string) => string;
}

interface SqliteInitFn {
  (opts?: SqliteInitOpts): Promise<unknown>;
}

let _modPromise: Promise<SqliteInitFn> | null = null;

async function loadInit(): Promise<SqliteInitFn> {
  if (_modPromise) return _modPromise;
  _modPromise = import("@sqlite.org/sqlite-wasm").then(
    (m) => (m as unknown as { default: SqliteInitFn }).default,
  );
  return _modPromise;
}

/**
 * Initialise sqlite-wasm with an explicit `locateFile` that points to the
 * Vite-served asset URL for `sqlite3.wasm`. Returns the `sqlite3` namespace
 * object the calling module casts to its own narrow surface.
 */
export async function initSqliteWasm<T>(): Promise<T> {
  const sqlite3InitModule = await loadInit();
  const sqlite3 = await sqlite3InitModule({
    locateFile: (file: string) => {
      if (file === "sqlite3.wasm") return sqliteWasmUrl;
      return file;
    },
  });
  return sqlite3 as T;
}
