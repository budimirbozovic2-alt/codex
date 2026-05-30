## Nalaz — gdje se logo (ne) prikazuje

Pretraga svih referenci na logo/ikonu u kodu:

| Mjesto | Datoteka | Trenutni izvor | Status |
|---|---|---|---|
| Electron native splash (BrowserWindow) | `public/splash.html` | **inline SVG** (geometrijski "CODEX" pentagon) | NE koristi raster logo |
| In-app splash (prije React mount-a) | `index.html:57` | `./logo-icon.png` | OK |
| Title bar (aplikacija) | `src/components/TitleBar.tsx:31` | `app-logo.png` | OK |
| Favicon (browser tab) | `index.html:13` | `./app-logo-favicon.png` | **BROKEN** — fajl ne postoji u `public/` |
| Electron BrowserWindow ikona | `electron/window.cjs:66,123` | `app-icon.ico` | OK |
| Electron-builder pakovanje | `package.json` | `app-icon.ico` / `app-icon.icns` | OK |

Dakle korisnik je u pravu: native Electron splash prozor (480×360 koji se vidi prije nego što se učita aplikacija) prikazuje custom SVG marker, ne stvarni logo. Pored toga, favicon u browser tabu pokazuje na nepostojeću datoteku.

## Plan

### 1. Electron splash (`public/splash.html`)
Zamijeniti inline SVG marker raster logoom radi vizuelne konzistentnosti sa in-app splashom i Title barom.

- Ukloniti `<svg>` blok unutar `.mark`
- Umetnuti `<img src="logo-icon.png" alt="CODEX" />` (logo-icon.png je već u `public/` i koristi ga in-app splash)
- Zadržati `ring`/`floatY`/`glow` animacije oko marker-a
- Zadržati ostatak: "CODEX" naslov (Fraunces), podnaslov, pulse-dot, fade-in

### 2. Favicon fix (`index.html:13`)
Promijeniti `./app-logo-favicon.png` → `./favicon.png` (postojeći fajl 32×32). Time se vraća logo u browser tab.

### 3. Verifikacija
Pokrenuti `grep` ponovo za potvrdu da nema preostalih referenci na nepostojeće asset-e i da svi splash/ikona surface-i koriste isti vizuelni identitet.

## Pitanje van scope-a

Ako se "novi logo" odnosi na **drugu datoteku** (npr. neki od kandidata u `src/assets/icon-*.png`) koju je trebalo proglasiti zvaničnim, recite koja je to slika i ja ću je kopirati u `public/` kao novi `logo-icon.png` (i regenerisati `app-icon.ico`/`favicon.png` iz nje). Trenutni plan pretpostavlja da je već postojeći `public/logo-icon.png` kanonski logo.

## Tehnički detalji

- `splash.html` se učitava preko `splash.loadFile()` iz `electron/window.cjs:73`, dakle relativne putanje rade direktno (`logo-icon.png` pored `splash.html`).
- Veličina `.mark` ostaje 84×84 — `img` će dobiti `width:100%;height:100%;object-fit:contain;`.
- Nema TS/React promjena, samo statički HTML.
