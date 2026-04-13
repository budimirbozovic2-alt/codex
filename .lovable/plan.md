

# Deep Audit: Boot Sequence — Greške i Uska Grla

## Rezime

Boot sekvenca je dobro strukturirana sa splash screenom, progress bar-om, timeout guardovima i error recovery-jem. Pronašao sam **7 konkretnih problema** — 2 uska grla, 3 potencijalne greške, i 2 optimizacije.

---

## USKA GRLA (bottlenecks)

### B1. Sekvencijalni dynamic imports u `main.tsx` blokiraju render
**Problem:** `main.tsx:54-64` — tri `await import()` poziva su sekvencijalni:
```
await import("./lib/app-settings")   // ~10-30ms
await import("./App")                // TEŠKI — vuče cijeli dependency graph
await import("react-dom/client")     // ~5ms
```
`App.tsx` je sinkroni import koji vuče: `framer-motion`, `AppSidebar`, `MainLayout` (koji vuče `planner-storage` → `date-fns`), `Breadcrumbs`, `ErrorBoundary`, itd. Tek nakon što se SVE ovo učita, poziva se `createRoot().render()`.

**Fix:** Paralelizovati nezavisne importove:
```tsx
const [{ initColorTheme }, { default: App }, { createRoot }] = await Promise.all([
  import("./lib/app-settings"),
  import("./App"),
  import("react-dom/client"),
]);
```
Ovo je ~15-30% brži first render.

### B2. `useCardBootstrap` sekvencijalno čeka 6+ IDB operacija
**Problem:** `useCardBootstrap.ts:100-246` — operacije se izvršavaju jedna za drugom:
1. `ensureDbOpen()` — do 6s timeout
2. `migrateFromLocalStorage()` — čisti legacy ključeve
3. `migrateMnemonicsFromLocalStorageToIDB()` — dynamic import + IDB write
4. `initMetacognitiveCache()` + `initPlannerCache()` — **ova 2 su paralelna** ✓
5. `idbLoadCards()` — do 5s timeout
6. `seedDefaultCategories()` — do 2.5s timeout  
7. Subcategory migration loop (sinkrona, ali O(n×m))
8. `idbLoadRecentReviewLog()` — do 2.5s timeout
9. `idbLoadSettings()` — do 2.5s timeout

Koraci 5-6 i 8-9 su nezavisni i mogu se paralelizovati:
```tsx
const [c, catRecords, log, settings] = await Promise.all([
  withTimeout(idbLoadCards(), 5000, "cards", []),
  withTimeout(seedDefaultCategories(), 2500, "categories", []),
  withTimeout(idbLoadRecentReviewLog(90), 2500, "review log", []),
  withTimeout(idbLoadSettings("srSettings", DEFAULT_SR_SETTINGS), 2500, "settings", DEFAULT_SR_SETTINGS),
]);
```
**Napomena:** `log` i `settings` se trenutno učitavaju NAKON kartica i kategorija (linije 238-246), ali ne zavise od njih. Paralelizacija štedi ~2-4s na sporim diskovima.

---

## POTENCIJALNE GREŠKE

### G1. Dupli splash timeout — 8s u `main.tsx` i 8s u `useCardBootstrap`
**Problem:** 
- `main.tsx:46-48` — `hideSplashImmediately()` nakon 8s
- `useCardBootstrap.ts:46-58` — `panicTimer` nakon 8s forsirano `setReady(true)`
- `index.html:98-116` — 10s fallback sa auto-reload (do 3 pokušaja)

Ova tri timera se preklapaju i mogu izazvati race condition: splash se može ukloniti dok boot još traje, ili boot može završiti dok HTML fallback radi reload. Specifično, ako `hideSplashImmediately` (main.tsx) ukloni splash na 8s, ali `panicTimer` (useCardBootstrap) još nije završio, korisnik vidi prazan ekran na ~1-2s.

**Fix:** Ukloniti `setTimeout` u `main.tsx:46-48` — `useCardBootstrap` već ima svoj panic timer i splash cleanup u `finally` bloku. HTML fallback na 10s ostaje kao ultimate safety net.

### G2. `MainLayout` eagerly importuje `planner-storage` sa `date-fns`
**Problem:** `MainLayout.tsx:13` importuje `loadPlanner`, `getSmartSuggestion`, `calcVelocity`, `getDailyMappedCount` — to vuče cijeli `planner-storage.ts` (577 linija) + `date-fns` u boot path. Ovo je potrebno SAMO za `NudgeWatcher` komponentu koja se aktivira tek kad korisnik navigira sa source route-a.

**Fix:** Lazy import unutar `NudgeWatcher` useEffect-a:
```tsx
const { loadPlanner, getSmartSuggestion, calcVelocity, getDailyMappedCount } = await import("@/lib/planner-storage");
```

### G3. `framer-motion` se eagerly importuje u `MainLayout`
**Problem:** `MainLayout.tsx:9` — `AnimatePresence` se koristi samo za `ZenMode` i `AppOnboarding`. `framer-motion` je ~40KB gzipped i učitava se na svakom page load-u.

**Fix:** Zamijeniti `AnimatePresence` sa CSS transition ili lazy importovati:
```tsx
const AnimatePresence = lazy(() => import("framer-motion").then(m => ({ default: m.AnimatePresence })));
```

---

## OPTIMIZACIJE

### O1. `service-worker-manager.ts` je mrtav kod
**Problem:** Fajl definiše `selectiveCacheCleanup` i `registerServiceWorker` ali se **nigdje ne importuje**. SW registracija se radi direktno u `main.tsx:192-204`.

**Fix:** Obrisati `src/lib/service-worker-manager.ts`.

### O2. `LearnOnboarding.tsx` eksportuje `hasSeenOnboarding` — nekompatibilno sa Fast Refresh
**Problem:** Vite HMR log kaže: `Could not Fast Refresh ("hasSeenOnboarding" export is incompatible)`. Ovo znači da svaka promjena na `LearnOnboarding.tsx` uzrokuje full page reload umjesto hot update-a.

**Fix:** Premjestiti `hasSeenOnboarding` export u zaseban utility fajl ili ga ukloniti iz komponente (koristi se samo kao re-export iz `OnboardingModal`).

---

## Šta je DOBRO (ne treba mijenjati)

- `ensureDbOpen` sa timeout + blocked handler + retry — robustan DB init
- `withTimeout` wrapper sa fallback vrijednostima — nikad ne blokira beskonačno
- `panicTimer` u useCardBootstrap — garant da UI neće ostati zauvijek na splash-u
- HTML-level 10s fallback sa auto-retry (3 pokušaja) — ultimate safety net
- Lazy loading svih route stranica (`lazy(() => import(...))`)
- Splash progress bar sa procentima — odličan UX tokom boot-a
- `checkInterruptedFlush()` — detektuje prekinute write-ove iz prošle sesije
- `visibilitychange` handler za flush — pouzdan signal za tab close

## Scope implementacije

**5-6 fajlova**, najvažnije izmjene su B1 (jednoliner) i B2 (refaktoring ~20 linija u useCardBootstrap). G2 i G3 su srednji effort. Ukupno ~1h rada.

