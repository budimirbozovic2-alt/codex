/**
 * WASM asset locator — fixes sqlite3-wasm OPFS proxy loading.
 *
 * Electron PROD: assets are in dist/sqlite/ (copied by Vite plugin)
 * Electron DEV: assets are served via Vite `/sqlite/` middleware
 *
 * The key issue: sqlite3-wasm expects installOpfsSAHPoolVfs to load
 * sqlite3-opfs-async-proxy.js and sqlite3-worker1.mjs from the SAME
 * origin/path as sqlite3.wasm. If they're not found, installOpfsSAHPoolVfs
 * is undefined and OPFS initialization fails.
 */

function isProduction(): boolean {
  return import.meta.env.PROD;
}

/**
 * Compute the base URL where sqlite3-wasm files should be served from.
 * Must match where the Vite plugin copies them (dist/sqlite/) and where
 * the dev server serves them (node_modules/@sqlite.org/sqlite-wasm/dist).
 */
function getWasmBasePath(): string {
  if (isProduction()) {
    // Electron PROD: Vite plugin copies assets to dist/sqlite/
    return "./sqlite/";
  }

  // Electron DEV: Vite serves files via the `/sqlite/` alias declared in
  // vite.config.ts (PR-H-OPFS-FIX H-4). Previously this returned "./sqlite/"
  // which 404'd for the OPFS proxy + worker1 files because no asset existed
  // at that path during dev — OPFS init fails loudly without WASM assets.
  return "/sqlite/";
}


/**
 * Locator callback for sqlite3InitModule. This is passed to the WASM
 * initializer to tell it where to find auxiliary files.
 *
 * sqlite3-wasm calls this for:
 *   - "sqlite3.wasm" (the binary)
 *   - "sqlite3-opfs-async-proxy.js" (OPFS proxy worker)
 *   - "sqlite3-worker1.mjs" (background worker)
 *
 * All three must be available or installOpfsSAHPoolVfs will be undefined.
 */
export function locateWasmFile(filename: string): string {
  const basePath = getWasmBasePath();
  return basePath + filename;
}
