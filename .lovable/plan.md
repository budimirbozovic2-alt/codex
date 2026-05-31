# Root cause: splash skripta u `index.html` reloaduje stranicu svakih ~10s

## Šta sam našao

`index.html` (linije 102–125) sadrži skriptu koja nakon 10 sekundi provjerava:

```js
var appMounted = root && root.querySelector("[data-app-mounted]");
if (appMounted) { ... return; }
if (retries < MAX_RETRIES) {
  sessionStorage.setItem(...);
  status.textContent = "Pokušaj " + (retries+2) + " od " + (MAX_RETRIES+1) + "…";
  setTimeout(() => window.location.reload(), 800);
}
```

**Problem:** atribut `data-app-mounted` se **nigdje u kodu ne postavlja** (provjereno `rg -rn "data-app-mounted" src` → 0 rezultata). React mount, splash cleanup u `src/main.tsx` i `src/hooks/card-bootstrap/splash.ts` skidaju vizualni splash, ali nikad ne markiraju root element.

**Posljedica:** u svakom non-Electron okruženju (Lovable preview, `bun run dev` u browseru) skripta uvijek ulazi u retry granu nakon 10s i reloaduje tab. Session replay to potvrđuje **tačno**:

- `t=0s` page loaded
- `t=10s` "Pokušaj 2 od 3…" → reload
- `t=21s` "Pokušaj 3 od 3…" → reload
- `t=32s` fallback "Aplikacija se učitava duže…"

## Zašto baš ova tri simptoma

Svaka operacija koja traje > 10 s od mounta (ili više od 10 s nakon zadnjeg uspješnog mounta) biva ubijena reloadom:

1. **Dodavanje kartica blokira aplikaciju** — prvi `useMutation` write nakon SQLite prewarm-a + WAL commit u DEV in-memory fallback-u; reload usred `bulkApply` ostavlja TanStack `onMutate` snapshot bez resolve-a i UI ostaje u disabled state-u dok se ne dogodi sljedeći reload.
2. **DOCX uvoz neuspješan** — `docx-worker` `postMessage` round-trip + parse većih `.docx` lako pređe 10s; reload uništi worker i `useDocxImportFlow` resolve nikad ne stigne, toast ostane „uspješan" iz ranije faze ili tiho propadne.
3. **Backup import nemoguć** — `parseJsonInWorker` → Zod → `migrateBackup` → `applyImportAtomically` (per-domain tx) traje znatno duže od 10 s na ozbiljnijem backupu; reload prekine transakciju, dialog se zatvori, podaci nisu primijenjeni.

Sve tri „regresije" su zapravo **isti** kvar, ne tri odvojena.

## Verifikacija da prethodni fix-evi nisu pomogli

Provjerio sam fajlove iz prošlog turn-a:

- `src/hooks/card-bootstrap/bootDb.ts` — SQLite prewarm radi, ali boot panic je 15 s; splash reload puca prije toga (10 s).
- `src/hooks/useCardBootstrap.ts` — panic timer 15 s je interni boot fail-safe, ne dotiče `index.html` skriptu.
- `src/features/docx-importer/docx-worker.ts` — switch na `mammoth.browser` riješio parse error, ali reload ga svejedno prekida.
- `src/hooks/useCardImport.ts` / `ExportImportDialog.tsx` — error propagation i „dialog stays open on failure" su ispravni, ali full page reload zaobilazi sav React error handling.

Dakle: **nijedan od prethodnih popravki nije adresirao stvarni uzrok jer je on u `index.html`, ne u React/persistence sloju.**

## Plan rješenja (minimalan, jedna izmjena + sanity guard)

### 1. `index.html` — uslovi reload na stvarni mount + cleanup pri uspješnom mount-u

- Splash skripta umjesto polling-a za nepostojeći atribut treba slušati event koji `main.tsx` emituje nakon `createRoot(...).render(<App />)`.
- Konkretno: zamijeniti provjeru `root.querySelector("[data-app-mounted]")` sa provjerom postavljenog `window.__codexAppMounted === true` **i** zadržati DOM atribut kao fallback.
- Timer mora biti otkaziv: čuvati `var t = setTimeout(...)` na window scope-u (`window.__codexSplashTimer`) tako da ga `main.tsx` može počistiti čim React mount uspije.

### 2. `src/main.tsx` — signalizirati uspješan mount

Odmah nakon `createRoot(...).render(<App />)`:

- `window.__codexAppMounted = true`
- `document.getElementById("root")?.setAttribute("data-app-mounted", "1")`
- `clearTimeout(window.__codexSplashTimer)` i `sessionStorage.removeItem("__codex_boot_retries")`

Time se splash retry petlja eliminira u **svim** okruženjima (Electron i preview), bez taknute persistence logike.

### 3. (Opcionalno, defense-in-depth) Produžiti splash timeout sa 10 s na 20 s

U Lovable preview-u cold SQLite WASM init + prvi mount može trajati 6–8 s; 10 s je preusko. 20 s ostavlja udobnu marginu, a stvarni mount signal iz koraka 2 u praksi otkaže timer prije toga.

### 4. Validacija nakon implementacije

- Otvoriti preview, potvrditi u replay-u da nema „Pokušaj 2/3 od 3…" tranzicija.
- Dodati novu kategoriju → ne blokira.
- Importovati `.docx` izvor → toast „uspješno" + izvor se pojavljuje.
- Importovati backup .json → dialog ostaje otvoren do completion-a, podaci primijenjeni.

## Tehnički detalji izmjena

```text
index.html (script blok linije 101–126):
  - var t = setTimeout(function(){ ... }, 20000);
  - window.__codexSplashTimer = t;
  - provjera: var appMounted = window.__codexAppMounted || root.querySelector("[data-app-mounted]");

src/main.tsx (odmah nakon createRoot().render):
  + (window as any).__codexAppMounted = true;
  + document.getElementById("root")?.setAttribute("data-app-mounted", "1");
  + const tid = (window as any).__codexSplashTimer;
  + if (tid) { clearTimeout(tid); (window as any).__codexSplashTimer = null; }
  + try { sessionStorage.removeItem("__codex_boot_retries"); } catch {}
```

Nema izmjena u persistence / SQLite / docx / backup kodu — oni su funkcionalno ispravni; samo ih je gasio reload.
