

# Electron Windows Build & Test

## Current State

All `app://` MIME fixes are already in place:
- `main.cjs`: `protocol.handle('app', ...)` with explicit MIME map and `fs.readFileSync` + `Response` headers
- `vite.config.ts`: `base: './'` and `build: { emptyOutDir: true }` (no risky `manualChunks`)
- `electron/window.cjs`: loads `app://localhost/index.html` in production, CSP skips `file://`

## Build Steps

### 1. Vite production build
```bash
cd /dev-server && npx vite build
```

### 2. Install Electron + Packager
```bash
cd /dev-server && npm install --save-dev electron @electron/packager
```

### 3. Package for Windows
```bash
cd /dev-server && npx @electron/packager . "Codex" \
  --platform=win32 --arch=x64 \
  --out=electron-release --overwrite \
  --ignore='node_modules' \
  --ignore='^/src' --ignore='^/public' \
  --ignore='^/electron-release'
```

### 4. Archive for download
```bash
cd /dev-server/electron-release && \
  nix run nixpkgs#zip -- -r /mnt/documents/Codex-win32-x64.zip Codex-win32-x64/
```

### 5. Verify (static check)
Confirm `dist/index.html` exists and references relative `./assets/` paths. Confirm `main.cjs` and `preload.cjs` are included in the package.

## Output
A downloadable `Codex-win32-x64.zip` in `/mnt/documents/` ready to extract and run on Windows.

