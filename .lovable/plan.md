

# Deep Audit — provjera 12 navoda

## Verifikovani nalazi (osnovani)

### 🔴 #1 Path traversal u `app://` protocol handler — POTVRĐEN
`main.cjs:159` koristi `decodeURIComponent(url.pathname)` direktno u `path.join` bez naknadne provjere da rezultat ostaje unutar `distPath`. URL poput `app://localhost/../../../etc/passwd` može izaći iz dist foldera.
**Fix:** Nakon `path.resolve(filePath)`, provjeriti `resolved.startsWith(distPath + path.sep)` — ako ne, fallback na `index.html`.

### 🔴 #2 `fs.readFileSync` u async `protocol.handle` — POTVRĐEN
`main.cjs:171, 178` koriste sinhrono čitanje unutar async handler-a. Blokira main thread po svakom asset zahtjevu.
**Fix:** `await fs.promises.readFile(...)`.

### 🟡 #5 Symlink bypass `isPathAllowed` — POTVRĐEN ali nizak rizik
`main.cjs:60-62` koristi `path.resolve` + `startsWith`, ne prati symlink-ove. Korisnik može kreirati symlink u Documents koji vodi van dozvoljenog dira. **Realan rizik nizak** (lokalna desktop app, korisnik bi sam sebe napao), ali defense-in-depth opravdava `fs.realpath`.

### 🟡 #11 `rimraf` nije u dependencies — POTVRĐEN
`package.json:8` poziva `rimraf dist release` u prebuild, ali `rimraf` nije u dependencies ni devDependencies. **Trenutno radi** jer je `rimraf` tranzitivno povučen (npr. preko ESLint/Vite chain-a), ali to nije garantovano.
**Fix:** Dodati `"rimraf": "^5.0.5"` u devDependencies, ili još bolje — zamijeniti sa `"prebuild": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true});require('fs').rmSync('release',{recursive:true,force:true})\""` (zero-dep).

## Djelomično osnovani

### 🟡 #3 `backup.cleanup()` await — DJELOMIČNO
`backup.cjs:128` — `cleanup` je sinhron (`clearInterval`), nema async potrebe. Ali u `main.cjs:218` `before-quit` await-uje `performBeforeQuitBackup()` što JE async i pravilno čeka. Navod o `window-all-closed` cleanup nije problem.

### 🟡 #4 `mainWindow` u `second-instance` — DJELOMIČNO
`main.cjs:223-228` koristi closure `mainWindow` umjesto `getMainWindow()`. Tehnički radi jer `setMainWindow` se pozove sinhrono u `createWindow`, prije nego što korisnik može pokrenuti drugu instancu. **Konzistentnost** opravdava korištenje `getMainWindow()`.

### 🟡 #7 IPC listener leak u preload — DJELOMIČNO
`preload.cjs:18-22` vraća cleanup funkciju. `main.tsx` poziva cleanup u `beforeunload`/`unload`/`hot.dispose` — **uredno**. Listener se postavlja jednom po app lifetime-u (ne po komponenti). Realan leak rizik: nizak.

## Neosnovani / netačni

### 🟢 #6 Nedostaju IPC handleri — NETAČAN
Sve navedeno postoji:
- `get-app-version`, `request-backup`, `get-backup-info` → `electron/backup.cjs:89-116` ✓
- `window-minimize/maximize/close/is-maximized`, `window-maximized-changed` → `electron/window.cjs:123-130` ✓

### 🟢 #8 `readFileSync(package.json)` u vite.config — NEOSNOVAN
Vite config se izvršava samo u Node okruženju gdje `fs` uvijek postoji. Nije problem.

### 🟢 #9 `lovable-tagger` u prod — NETAČAN
Već je korektno guarded sa `mode === "development" &&` i u devDependencies (`package.json:117`).

### 🟢 #10 `data-app-mounted` se ne postavlja — NETAČAN
`src/App.tsx:43` ima `<div className="flex flex-col h-screen" data-app-mounted>`. Splash retry mehanizam radi ispravno.

### 🟢 #12 `strict: false` u tsconfig — STILSKO, ne bug
Validan tehnički izbor projekta. Memory navodi "zero-any policy" koja se sprovodi na drugi način.

## Plan implementacije (samo osnovani nalazi)

**Prioritet 1 — kritično (~10 min):**
- **#1** `main.cjs` app:// handler — dodati path validaciju nakon `path.resolve`, vratiti index.html za out-of-bounds putanje (~5 linija)
- **#2** `main.cjs` app:// handler — zamijeniti `fs.readFileSync` sa `await fs.promises.readFile` na obje lokacije (~3 izmjene)

**Prioritet 2 — defense-in-depth (~5 min):**
- **#11** `package.json` — dodati `"rimraf": "^5.0.5"` u devDependencies (1 linija)
- **#5** `main.cjs` `isPathAllowed` — dodati `fs.realpathSync.native` provjeru sa try/catch fallback-om za nepostojeće putanje (~10 linija)

**Prioritet 3 — kozmetika (~3 min):**
- **#4** `main.cjs:223` — zamijeniti `mainWindow` sa `getMainWindow()` u `second-instance` handleru za konzistentnost (3 linije)

**Ne implementirati:** #3, #6, #7, #8, #9, #10, #12 (neosnovani ili nizak realan rizik bez konkretne koristi).

**Ukupno:** 1 fajl primarno (`main.cjs`) + 1 linija u `package.json`. ~25 izmijenjenih linija.

