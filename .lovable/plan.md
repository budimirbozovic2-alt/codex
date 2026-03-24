

## Detaljna analiza: Electron, monoliti, regresije i optimizacija

### Metodologija
Pregledano: `main.cjs`, `preload.cjs`, `main.tsx`, `App.tsx`, `AppContext.tsx`, `useCards.ts` (910 linija), `ReviewSession.tsx` (812 linija), `LearnSession.tsx` (342 linije), `MainLayout.tsx`, `db.ts`, `app-settings.ts`, `SourceReader.tsx`, svih 21 fajl koji koriste `useAppContext()`.

---

### STATUS PRETHODNO RIJESENIH PROBLEMA

Svi planirani problemi iz prethodnih iteracija su rijeseni. Electron backup cita IDB, kategorije koriste surgical upsert, MainLayout ne zavisi od `cards`, AppSettings ima IDB fallback, notification scheduler dinamicki cita settings.

---

### NOVI PROBLEMI

#### P0 — Kriticno

**1. main.cjs: 340 linija monolit bez strukture**
Electron main process sadrzi SVE u jednom fajlu: window management, splash screen, backup sistem, IPC handlere, state persistence. Problem: svaka izmjena rizikuje regresiju u drugom dijelu. Crash recovery logika (linije 152-163) i backup sistem (208-275) su potpuno isprepleteni sa window kreiranjem.

Rizik: `render-process-gone` handler (linija 152) poziva `createWindow(newSplash)` rekurzivno. Ako renderer padne u petlji, dobijamo neogranicenu rekurziju splash+window kreiranja. Nema limita na broj recovery pokusaja.

**2. useCards.ts: 910-linijski monolit — najveci fajl u projektu**
Hook koji sadrzi SVE operacije nad karticama: CRUD, import/export, backup, kategorije, podkategorije, bulk operacije, review logiku. Promjena u jednoj funkciji moze izazvati regresiju u drugoj. Problem je posebno akutan jer se svaka funkcija kreira sa `useCallback` i ima kompleksne dependency array-e.

**3. importData (useCards.ts:708-860) koristi `db.sources.clear()` pri overwrite strategiji**
Linije 803-804: `await db.sources.clear()` prije `bulkPut` — isti destructive pattern koji smo uklonili iz kategorija i metacognitive-storage. Ako crash nastane izmedju clear i bulkPut, svi izvori su izgubljeni. Isto se desava za mindMaps (812-815) i sve metacognitive tabele (832-837).

#### P1 — Visoki prioritet

**4. 21 komponenta koristi useAppContext() umjesto specificnih konteksta**
`useAppContext()` merge-uje CardContext i UIContext u novi objekat svaki put. Svaka komponenta koja ga koristi re-renderuje se kad se BILO STA promijeni — cards, pomodoro tick, navigacija. Kljucni primjeri:
- `DashboardPage` destrukturise cards, stats, categories, reviewLog, srSettings, setView — ali setView je jedina UI stvar
- `StatsPage`, `MetacognitivePage`, `FrequentErrorsPage` — isti pattern
- `ReviewPage` — destrukturise 9 polja iz useAppContext

**5. ReviewSession.tsx: 812-linijski monolit**
Sadrzi 4 logicke cjeline u jednom fajlu:
- Setup UI (izbor moda, filteri) — linije 68-393
- Review logika (grading, undo, navigation) — linije 395-449
- ReviewCard komponenta — linije 511-812
- Pomocne komponente (FinishedScreen, HowItWorksCorner, onboarding data) — linije 451-509

ReviewCard sama je 300 linija i sadrzi keyboard handler, calibration logiku, confidence selector, grade buttons, source snippet dialog — sve u jednoj funkciji.

**6. Electron crash recovery nema limit**
`main.cjs` linija 152-163: `render-process-gone` kreira novi splash + window bez provjere koliko puta se to desilo. Ako postoji sistemski problem (npr. GPU driver), aplikacija ce se beskonacno restartovati.

**7. main.cjs: `before-quit` salje backup-requested ali ne ceka odgovor**
Linija 321-324: `mainWindow.webContents.send('backup-requested')` je fire-and-forget. App moze izaci prije nego renderer zavrsi backup. Backup handler u rendereru (main.tsx:88-145) je async i traje potencijalno sekundama za 2500+ kartica.

#### P2 — Srednji prioritet

**8. Electron: nema CSP zaglavlja u production buildu**
`main.cjs` ne postavlja Content-Security-Policy. Pod `file://` protokolom, bez CSP-a, moguc je XSS ako korisnik importuje maliciozan HTML izvor.

**9. LearnSession.tsx (342 linije) — manji monolit**
Slicna struktura kao ReviewSession ali manja. Setup, filtriranje i session logika su u jednom fajlu.

**10. SourcesView.tsx koristi useAppContext ali treba samo cards i bulkFlagNeedsReview**
Nepotrebno se re-renderuje na svaku Pomodoro tick i navigaciju.

---

### PLAN IMPLEMENTACIJE

#### Faza 1 — Kriticne popravke i Electron stabilnost

**Korak 1: Electron crash recovery limit**
Dodati broja pokusaja u `main.cjs`. Ako renderer padne 3+ puta u 60 sekundi, prikazati error dijalog umjesto beskonacnog loopa.

```text
main.cjs izmjene:
- Dodati crashCount i lastCrashTime varijable
- U render-process-gone: provjeri crashCount
- Ako > 3 u 60s: prikazati dialog.showErrorBox() i ne restartovati
```

**Korak 2: Electron before-quit backup sa cekanjem**
Zamijeniti fire-and-forget `send` sa `invoke` patternom koji ceka zavrssetak backupa (sa timeout-om od 5 sekundi).

**Korak 3: Popraviti destructive clear() u importData**
Zamijeniti `db.sources.clear() + bulkPut` sa `bulkPut` bez prethodnog brisa za "overwrite" strategiju (sources, mindMaps, metacognitive tabele). Za overwrite: citaj sve kljuceve, bulkPut nove, obrisi razliku.

#### Faza 2 — Refaktoring monolita

**Korak 4: Razbiti useCards.ts na module**
Izvuci u zasebne fajlove:
- `src/hooks/useCardCRUD.ts` — addCard, updateCard, deleteCard, splitCard, patchCard
- `src/hooks/useCardExport.ts` — exportData, exportTemplate, buildJsonChunked
- `src/hooks/useCardImport.ts` — importData, importCards
- `src/hooks/useCategoryManagement.ts` — addCategory, renameCategory, deleteCategory, subcategory operacije
- `src/hooks/useCards.ts` — ostaje kao orchestrator koji compose-uje gornje hookove

**Korak 5: Razbiti ReviewSession.tsx na komponente**
- `src/components/review/ReviewSetup.tsx` — izbor moda i filteri (linije 68-393)
- `src/components/review/ReviewCard.tsx` — prikaz kartice i grading (linije 511-812)
- `src/components/review/ReviewComplete.tsx` — FinishedScreen (linije 496-509)
- `src/components/review/review-constants.ts` — onboarding slides, shortcuts, types
- `src/components/ReviewSession.tsx` — ostaje kao thin orchestrator (~100 linija)

**Korak 6: Razbiti main.cjs na module**
- `electron/window.cjs` — createWindow, createSplashWindow, window state
- `electron/backup.cjs` — backup sistem, IPC handler
- `electron/main.cjs` — orchestrator, app lifecycle

#### Faza 3 — useAppContext migracija

**Korak 7: Migriraj kljucne view-ove na specificne kontekste**
Komponente koje trebaju samo UI funkcije (setView):
- `MnemonicPage` — koristi samo `setView` → `useUIContext()`
- `SettingsPage` — koristi samo `srSettings` + `setView` → split

Komponente koje trebaju samo cards:
- `SourcesView` — koristi `cards` + `bulkFlagNeedsReview` → `useCardContext()`
- `FrequentErrorsPage` — koristi `cards` + `clearErrorLog` + `setView` → split

Teske komponente (cards + UI):
- `DashboardPage`, `ReviewPage`, `LearnPage`, `StatsPage` — trebaju oba, ali mogu koristiti `useCardContext()` + `useUIContext()` direktno umjesto merge-ovanog `useAppContext()`

#### Faza 4 — Electron sigurnost

**Korak 8: Dodati CSP zaglavlje**
U `main.cjs`, koristiti `session.defaultSession.webRequest.onHeadersReceived` za dodavanje `Content-Security-Policy` u produkciji.

---

### Tehnicki pregled

```text
P0 — Stabilnost i integritet:
  main.cjs                     → 340-linijski monolit, crash recovery bez limita
  useCards.ts                  → 910-linijski monolit, tezak za odrzavanje
  importData clear()+bulkPut   → destructive pattern za sources/mindMaps/metacognitive

P1 — Performanse i odrzivost:
  21x useAppContext()          → nepotrebni re-renderi na svaku promjenu
  ReviewSession.tsx            → 812-linijski monolit bez dekompozicije
  before-quit backup           → fire-and-forget, moze izgubiti podatke

P2 — Sigurnost i cistooca:
  Electron CSP                 → nedostaje u produkciji
  LearnSession.tsx             → manji monolit (342 linije)
```

### Obim rada
- Faza 1 (Kriticno): 3 fajla, ~60 linija izmjena
- Faza 2 (Refaktoring): 8+ novih fajlova, ~0 novih linija (premjestanje)
- Faza 3 (Migracija): 10+ fajlova, ~2-3 linije po fajlu
- Faza 4 (Sigurnost): 1 fajl, ~15 linija

Preporuka: Implementirati Fazu 1 i Fazu 2 (Korak 5 — ReviewSession razbijanje) kao prvi prioritet, jer direktno uticu na stabilnost i odrzivost.

