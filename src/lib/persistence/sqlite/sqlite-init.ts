/**
 * Shared sqlite-wasm initializer.
 *
 * Vite's prebundled `@sqlite.org/sqlite-wasm` resolves 
 * `sqlite3.wasm` via `new URL("sqlite3.wasm", import.meta.url)` 
 * which, in the dev server, points to 
 * `/node_modules/.vite/deps/sqlite3.wasm` — a path the dev 
 * server does NOT serve as `application/wasm` (it returns the 
 * HTML fallback), causing `WebAssembly.instantiate` to fail 
 * with "expected magic word".
 *
 * The fix is to import the wasm as an explicit Vite asset 
 * (`?url`) and pass it to the sqlite initializer via 
 * `locateFile`. This works in:
 * • DEV (Vite serves the asset with the right MIME type),
 * • PROD web (Vite hashes & emits the asset),
 * • Electron PROD (Vite plugin copies `sqlite3.wasm` into 
 * `dist/sqlite/`; the runtime falls back to that path 
 * if `locateFile` returns 404 — and for Electron PROD 
 * the bundled `?url` already resolves correctly).
 */
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { locateWasmFile } from "./wasm-locator";

interface SqliteInitOpts {
  locateFile?: (file: string) => string;
}

interface SqliteInitFn {
  (opts?: SqliteInitOpts): Promise<unknown>;
}

let _modPromise: Promise<SqliteInitFn> | null = null;

async function loadInit(): Promise<SqliteInitFn> {
  if (_modPromise) return _modPromise;
  
  // SREDNJE 4 FIX: Ako dynamic import zakaže, čistimo 
  // keširanu referencu kako bismo omogućili ponovni pokušaj.
  _modPromise = import("@sqlite.org/sqlite-wasm")
    .then((m) => (m as unknown as { default: SqliteInitFn }).default)
    .catch((err) => {
      _modPromise = null; 
      throw err;
    });
    
  return _modPromise;
}

/**
 * Initialise sqlite-wasm with an explicit `locateFile` that 
 * points to the Vite-served asset URL for `sqlite3.wasm`. 
 * Returns the `sqlite3` namespace object.
 *
 * RC-11 fix: The locateFile function now tries the bundled 
 * ?url asset first (works in all environments) before 
 * falling back to computed paths for the OPFS proxy files 
 * (sqlite3-opfs-async-proxy.js, sqlite3-worker1.mjs).
 * This ensures all three auxiliary files are resolved from 
 * the same location so installOpfsSAHPoolVfs is available.
 */
export async function initSqliteWasm<T>(): Promise<T> {
  const sqlite3InitModule = await loadInit();
  const sqlite3 = await sqlite3InitModule({
    locateFile: (file: string) => {
      // Primary: bundled asset (works in all environments)
      if (file === "sqlite3.wasm") return sqliteWasmUrl;
      
      // Fallback: compute path for auxiliary files (OPFS 
      // proxy, worker). This ensures they're loaded from 
      // the same dist/sqlite/ location where Vite's 
      // copySqliteWasmPlugin copies them.
      return locateWasmFile(file);
    },
  });
  return sqlite3 as T;
}