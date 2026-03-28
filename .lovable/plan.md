

# Fix Electron Eternal Loading — 4 Changes

## Current State Assessment

After inspecting all 4 files:

- **`src/main.tsx`**: SW Electron guard already applied (line 189). `notifyReady()` is correctly called from `useCardBootstrap.ts` (line 170-172), not from `main.tsx`. **No changes needed.**
- **`main.cjs`**: CSP `file://` bypass already applied (lines 53-56). **No changes needed.**
- **`electron/window.cjs`**: Missing `webSecurity: false`. **Needs fix.**
- **`vite.config.ts`**: Has `manualChunks` that can cause TDZ errors with recharts. **Needs fix.**

## Changes (2 files)

### 1. `electron/window.cjs` — Add `webSecurity: false`
In `webPreferences` (line 84-91), add `webSecurity: false` so Chromium allows ES module `<script type="module">` over `file://` protocol.

### 2. `vite.config.ts` — Remove `rollupOptions`, add `emptyOutDir`
Replace lines 41-56 (`build: { rollupOptions: { ... } }`) with `build: { emptyOutDir: true }`. This eliminates the recharts TDZ `ReferenceError` caused by manual chunk splitting.

## Files unchanged
- `src/main.tsx` — already has Electron SW guard
- `main.cjs` — already has `file://` CSP bypass

