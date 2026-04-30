
# PRE-BUILD AUDIT REPORT — CODEX v3.0.0

Scope: `main.cjs`, `preload.cjs`, `electron/window.cjs`, `electron/backup.cjs`, `package.json`, `vite.config.ts`, import/export pipeline.

---

## PILLAR 1 — Electron Security & IPC: **[BLOCKER]**

### Findings

| Check | Status | Evidence |
|---|---|---|
| `nodeIntegration: false` | PASS | `window.cjs:107`, splash `:64` |
| `contextIsolation: true` | PASS | `window.cjs:108`, splash `:65` |
| `sandbox: true` | **BLOCKER** | `window.cjs:110` explicitly sets `sandbox: false` |
| `enableRemoteModule` absent | PASS | not present anywhere |
| `will-navigate` guard | PASS | `main.cjs:228-240` — blocks non-app/non-localhost, delegates http(s) to `shell.openExternal` |
| `setWindowOpenHandler` | PASS | `main.cjs:241-244` — denies all, http(s) → external |
| `will-attach-webview` blocked | PASS | `main.cjs:246` |
| Preload surface | PASS | `preload.cjs` exposes only typed function bridge via `contextBridge`. No raw `ipcRenderer`, `fs`, `path`, or `child_process` leaked. |
| IPC payload validation | PASS | base64 regex + size cap (`main.cjs:118-144`); path traversal guard (`main.cjs:185-190`); `isPathAllowed` whitelist + symlink resolution (`main.cjs:66-83`); dialog options whitelist (`main.cjs:86-94`). |
| Splash `preload` | WARNING | Splash window has no preload and no `sandbox: true` declared. Loads only local `splash.html` so risk is low, but inconsistent with hardening posture. |

### BLOCKER 1 — Sandbox disabled on main window

**File:** `electron/window.cjs`
**Lines:** 106–112

Current:
```js
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  preload: resolvePreloadPath(isDev, baseDir),
  sandbox: false,
},
```

Required fix (preload uses only `contextBridge` + `ipcRenderer.invoke/send/on`, all of which work in a sandboxed preload — no `fs`/`path`/`require` of native modules in `preload.cjs`, so enabling sandbox is safe):
```js
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  preload: resolvePreloadPath(isDev, baseDir),
  webviewTag: false,
  spellcheck: false,
},
```

Also harden splash (`window.cjs:63-66`):
```js
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
},
```

---

## PILLAR 2 — Build Configuration & ASAR Packaging: **[BLOCKER]**

### Findings

| Check | Status | Evidence |
|---|---|---|
| `asar: true` | PASS | `package.json:28` |
| DevTools gated | PASS | `window.cjs:135` — only opens when `!isDev && process.env.CODEX_DEBUG` |
| Production menu/shortcuts blocked | PASS | `window.cjs:140-151` |
| CSP headers in prod | PASS | `main.cjs:210-224` — `default-src 'self' app:`. Note: `script-src 'unsafe-inline'` remains (Vite injects inline scripts) — accepted trade-off. |
| Custom `app://` protocol | PASS | registered with `secure: true, standard: true` and traversal-guarded handler. |
| Conflicting builders | WARNING | electron-builder is the chosen tool; no Forge/`@electron/packager` config detected. Memory note about `@electron/packager` does not apply to this repo. |

### BLOCKER 2 — `preload.cjs` will be missing in packaged ASAR

**File:** `package.json`
**Lines:** 6 and 29–40

Two related defects:

1. `"main": "main.cjs"` is correct, but `files` array (`:29-34`) does **NOT** include `preload.cjs`:
   ```json
   "files": [
     "dist/**/*",
     "main.cjs",
     "electron/**/*.cjs",
     "package.json"
   ],
   ```
   `preload.cjs` lives at the project root and matches none of these globs, so it will not be packed into `app.asar`.

2. `extraResources` (`:35-40`) copies `preload.cjs` next to the asar, **outside** the asar:
   ```json
   "extraResources": [{ "from": "preload.cjs", "to": "preload.cjs" }]
   ```
   Combined with `resolvePreloadPath` (`window.cjs:10-19`) which checks `process.resourcesPath/preload.cjs` first, this *would* work — but only because of `extraResources`. The dual setup is fragile and the `baseDir` candidate (`__dirname` inside `app.asar`) will fail.

Required fix (`package.json:29-40`) — pack preload inside asar AND drop the extraResources duplicate:
```json
"files": [
  "dist/**/*",
  "main.cjs",
  "preload.cjs",
  "electron/**/*.cjs",
  "package.json"
],
```
Then remove the `extraResources` block entirely. `resolvePreloadPath` already falls back to `path.join(baseDir, 'preload.cjs')`, which resolves correctly inside the asar.

### BLOCKER 3 — `mac.target: dmg` with PNG icon

**File:** `package.json:49-52`

```json
"mac": { "target": "dmg", "icon": "public/icon-512.png" }
```

electron-builder requires a `.icns` file for macOS DMG builds. A `.png` will either fail the build or produce an icon-less DMG.

Required fix (either ship an `.icns` or drop the explicit icon and rely on the default):
```json
"mac": {
  "target": ["dmg", "zip"],
  "icon": "build/icon.icns",
  "category": "public.app-category.education"
}
```
If you do not have `build/icon.icns` yet, generate one from `icon-512.png` (e.g., `iconutil` / `png2icns`) before running `npm run dist:mac`.

---

## PILLAR 3 — Bundle Optimization & Dependency Leaks: **[WARNING]**

### Findings

| Check | Status | Evidence |
|---|---|---|
| TS / ESLint / Vite plugins | PASS | All in `devDependencies` (`:99-127`) |
| Native modules needing rebuild | PASS | No `better-sqlite3`, `sqlite3`, `node-sqlite`, or other native bindings in deps. Persistence is pure Dexie/IndexedDB. |
| `rimraf` location | **WARNING** | `rimraf ^5.0.5` is in `dependencies` (`:93`) but only used by the `prebuild` script. It will bloat the asar. Move to `devDependencies`. |
| `lovable-tagger` | PASS | In `devDependencies` and only loaded in Vite dev mode (`vite.config.ts:19`). Will not be in renderer bundle. |
| Heavy renderer libs | INFO | `framer-motion`, `recharts`, `@xyflow/react`, `mammoth`, `jszip` are legitimate runtime deps. Tree-shaking handled by Vite. |

### Required fix (`package.json`)

Move `rimraf` from `dependencies:93` to `devDependencies`. (Roughly ~30 transitive dev-only packages will then be excluded from the final asar via electron-builder's prod-deps pruning.)

---

## PILLAR 4 — TypeScript & React Strictness: **[WARNING]**

### Findings

`rg : any | as any` shows the codebase is largely zero-any compliant per the documented policy, with the **import/export migration boundary** as the documented exception.

| File | `any` count | Risk |
|---|---|---|
| `src/hooks/useCardImport.ts` | 10 | Boundary code parsing untyped JSON imports — acceptable, but each `any` should be narrowed before being persisted. |
| `src/hooks/useCardExport.ts` | 2 | Subcategory shape coercion — low risk. |
| `src/components/ExportImportDialog.tsx` | 4 | UUID validator and `parsed.categories` cast — low risk. |
| `src/test/persist-queue-c3c4.test.ts` | 10 | Test-only — ignore. |
| `src/hooks/useMindMapCanvas.ts` | 6 | ReactFlow node payload — acceptable. |
| Other source files | ≤2 each | Within tolerance. |

No `tsc --noEmit` issues will fail the build (the harness runs typecheck automatically and the project is currently green per memory). No bare `await` outside `try/catch` was introduced in the new wizard files (`split-wizard-build.ts` is pure, `useSourceReaderActions.ts` wraps mutations).

### Recommended (non-blocking) follow-up

In `useCardImport.ts:86-97`, replace `(c: any)` with a `LegacyCardJSON` interface (Pick of optional fields) so any future schema drift is caught at the boundary. Same for `(s: any)`, `(src)`, `(mm)`, `(n: any)`. This is the only critical data path where `any` could mask silent data loss in the desktop app.

---

## SUMMARY

| Pillar | Status |
|---|---|
| 1. Electron Security & IPC | **BLOCKER** (sandbox disabled) |
| 2. Build Config & ASAR | **BLOCKER** (preload packaging + macOS icon) |
| 3. Bundle / Dep leaks | **WARNING** (rimraf in deps) |
| 4. TS / React strictness | **WARNING** (boundary `any`s, advisory only) |

### GO / NO-GO: **NO-GO**

Three blockers must be patched before `npm run dist`:

1. **`electron/window.cjs:110`** — set `sandbox: true` (and harden splash `:63-66`).
2. **`package.json:29-40`** — add `preload.cjs` to `files`, remove the `extraResources` duplicate.
3. **`package.json:49-52`** — provide `build/icon.icns` or remove the PNG icon path; switch mac target to `["dmg","zip"]`.

Then move `rimraf` to `devDependencies` (warning, but trivial and reduces asar size).

After these four edits, the build is safe to run:
```text
npm run dist        # current platform
npm run dist:win    # Windows NSIS
npm run dist:mac    # macOS dmg + zip (requires icns)
```

If you approve, I will apply exactly these four edits — no feature changes, no refactors — and re-verify with the existing 264-test suite before handing back for the actual `electron-builder` run.
