# PR-H-OPFS-FIX-2: Restore OPFS durability in packaged Electron

## Root cause

`crossOriginIsolated` is technically set in PROD via `ISOLATION_HEADERS` in `main.cjs`, but two side-effects of those headers + a too-strict CSP prevent the renderer from reaching `installOpfsSAHPoolVfs`, so SQLite silently degrades to in-memory:

1. **CSP blocks `eval()`** — `PROD_CSP` in `main.cjs` has `script-src 'self' 'unsafe-inline' app:` (no `unsafe-eval`, no `wasm-unsafe-eval`). Any library using `eval`/`new Function` (Zod schema compiler in some paths, sqlite-wasm glue) is blocked, the boot chain throws before SQLite init completes, and the fallback in `client.ts` kicks in.
2. **COEP `require-corp` blocks Google Fonts** — `index.html` and `public/splash.html` load Fraunces (and splash DM Sans) from `fonts.googleapis.com` / `fonts.gstatic.com`. Those responses have no `Cross-Origin-Resource-Policy` header, so under `COEP: require-corp` they are blocked. The failing `<link>` chain delays first paint and (in some Chromium versions) cascades into the renderer marking the document as not fully isolated.

We must NOT relax COOP/COEP (OPFS-SAH-pool requires `crossOriginIsolated === true`). Fix = self-host fonts + widen CSP just enough for eval/wasm.

## Changes

### 1. `main.cjs` — widen PROD CSP

`PROD_CSP` becomes:
```
default-src 'self' app:;
script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' app:;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: app:;
font-src 'self' data: app:;
connect-src 'self' blob: app:;
media-src 'self' blob: app:;
worker-src 'self' blob: app:;
object-src 'none'; base-uri 'self'; frame-ancestors 'none';
```
Adds: `'unsafe-eval' 'wasm-unsafe-eval'` to `script-src`, plus hardening `object-src/base-uri/frame-ancestors`. No external origins — fonts are now local.

Keep `ISOLATION_HEADERS` exactly as today (COOP=same-origin, COEP=require-corp, CORP=cross-origin) so OPFS still works.

### 2. `index.html` — drop Google Fonts, self-host Fraunces

- Remove the 3 `<link>` tags for `fonts.googleapis.com` / `fonts.gstatic.com`.
- Update meta CSP to mirror the new PROD_CSP (drop `https://fonts.*`, add `'unsafe-eval'`).
- Rely on `@font-face` in `src/index.css` for Fraunces (added below).

### 3. `src/index.css` — add Fraunces `@font-face`

Add two `@font-face` blocks (latin + latin-ext) for Fraunces, mirroring the existing DM Sans pattern, pointing at `/fonts/fraunces-latin.woff2` and `/fonts/fraunces-latin-ext.woff2`.

### 4. `public/fonts/` — add Fraunces files

Download Fraunces variable woff2 (weights 300–700, opsz 9–144) from the Google Fonts CSS and place as:
- `public/fonts/fraunces-latin.woff2`
- `public/fonts/fraunces-latin-ext.woff2`

(Same approach already used for DM Sans.)

### 5. `public/splash.html` — drop Google Fonts

Remove the 3 Google Font `<link>` tags. Replace `font-family: 'DM Sans'` / `'Fraunces'` stacks with system-font fallbacks (`system-ui, -apple-system, Segoe UI, sans-serif` and `Georgia, 'Times New Roman', serif`). The splash is shown for ~200ms and doesn't need branded type; keeping it font-free avoids COEP/CORP issues in the splash BrowserWindow too.

### 6. Tests

Extend `src/test/pr-h-opfs-electron.test.ts` with guards:
- `PROD_CSP` in `main.cjs` contains `'unsafe-eval'` AND `'wasm-unsafe-eval'`.
- `PROD_CSP` does NOT contain `fonts.googleapis.com` / `fonts.gstatic.com`.
- `index.html` contains no `googleapis.com` / `gstatic.com` references.
- `public/splash.html` contains no `googleapis.com` / `gstatic.com` references.
- `src/index.css` contains an `@font-face` for `Fraunces` pointing at `/fonts/`.

## Verification

1. `bunx tsc --noEmit` → 0 errors.
2. `bunx vitest run pr-h-opfs-electron` → all green.
3. Manual packaged Electron run: DevTools console must show
   - `self.crossOriginIsolated === true`
   - `[sqlite] opened OPFS-SAH-pool DB` (NOT `falling back to in-memory`)
   - No CSP violation reports for `eval` or `gstatic`.
4. Create a card, restart the app, confirm it persists.

## Out of scope

- Bundle 2 (PR-H-BACKUP-IPC) and Bundle 3 (PR-H-BUILD-CLEANUP) from the earlier audit — separate PRs.
- Replacing Fraunces with another display font — keeping current visual identity.
