

## Plan: Verifikacija Electron build-a nakon security patcheva

### Kontekst

Korisnik traži pokretanje Electron build-a da se potvrdi da nedavne izmjene u `main.cjs` (path traversal guard, async `fs.promises.readFile`, symlink-aware `isPathAllowed`) ne uzrokuju regresiju u serviranju asset-a kroz `app://` protocol.

### Šta ću uraditi

**1. Build pipeline:**
- `npm install` (osigurati `rimraf` i ostale devDependencies)
- `npx vite build` (proizvodi `dist/` folder koji `app://` handler servira)
- Verifikovati da `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css` postoje

**2. Statička analiza protocol handler-a:**
- Pročitati finalni `main.cjs` da potvrdim:
  - `path.resolve` + `startsWith(distPath + path.sep)` guard
  - `await fs.promises.readFile` na obje grane (success i fallback)
  - MIME mapiranje radi za `.js`, `.css`, `.html`, `.svg`, `.woff2`
- Simulirati nekoliko URL-ova (mentalno trace):
  - `app://localhost/` → `index.html` ✓
  - `app://localhost/assets/index-abc.js` → unutar dist ✓
  - `app://localhost/../../etc/passwd` → blokirano, fallback na `index.html` ✓

**3. Smoke test asset rezolucije:**
- Pokrenuti kratak Node skript koji simulira `protocol.handle` logiku nad stvarnim `dist/` folderom za 3-4 reprezentativna URL-a (index, JS bundle, CSS, traversal pokušaj). Štampa MIME, status, byte count.

**4. Provjera da `vite.config.ts` ima `base: './'`** — kritično za `app://` resolution.

### Šta NE mogu uraditi

Ne mogu zaista pokrenuti `electron .` u sandbox-u i otvoriti GUI prozor — sandbox nema display server. Ali statički + skriptirani test pokriva sve grane `protocol.handle` koda.

### Fajlovi koje ću izmijeniti

Nijedan — ovo je verifikacija. Ako smoke test otkrije regresiju, vraćam sa popravkom u zasebnom planu.

### Output

Sažetak: build status, provjera 4 URL-scenarija, status `base` configa, i potvrda da nema regresije (ili lista nalaza ako ima).

