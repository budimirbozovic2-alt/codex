

# Deep Audit v2 — Greške, uska grla, optimizacije, UI

## Metodologija
Pregledano: ~40 fajlova, ~15K linija koda. Analizirane sve komponente, hook-ovi, storage sloj, konteksti i CSS.

---

## A. GREŠKE I PROBLEMI

### A1. `CardViewMode` filteri prikazuju UUID umjesto imena (BUG)
**Fajl:** `src/components/category/CardViewMode.tsx` L139-141
Subcategory i chapter filteri u `<SelectItem>` prikazuju raw UUID-e (`sub`, `ch`) umjesto čitljivih naziva. Korisnik vidi nečitljive stringove u dropdown-u.
**Fix:** Koristiti `catNameMap` lookup (isti pattern kao `CardList.tsx`) za pretvaranje UUID → ime.

### A2. `calcVelocity` pozvan sa praznim nizom u NudgeWatcher (BUG)
**Fajl:** `src/components/MainLayout.tsx` L50
`calcVelocity([], 7)` uvijek vraća 0 jer se proslijeđuje prazan niz umjesto stvarnog `reviewLog`-a. Nudge toast se nikad neće prikazati pravilno.
**Fix:** Proslijediti `reviewLog` iz konteksta.

### A3. `saveDisciplineLog` briše pa insertuje — race condition
**Fajl:** `src/lib/planner-storage.ts` L348-350
`db.disciplineLog.clear().then(() => bulkAdd(log))` — ako se tab zatvori između `clear` i `bulkAdd`, svi discipline podaci su izgubljeni.
**Fix:** Koristiti `db.transaction("rw", ...)` sa `clear + bulkAdd` u istoj transakciji.

### A4. `handleRebalance` ne sprema ništa (BUG)
**Fajl:** `src/components/planner/OperationsTab.tsx` L43-47
`calcRebalancedQuota` izračuna novu kvotu ali rezultat se nigdje ne koristi — `save({ ...config })` sprema nepromijenjeni config.
**Fix:** Ažurirati config sa novom kvotom prije poziva `save`.

---

## B. PERFORMANCE USKA GRLA

### B1. `useDashboardData` poziva `loadSlippageLog()` sinhrono na svakom rendereu
**Fajl:** `src/hooks/useDashboardData.ts` L171
`loadSlippageLog()` se poziva unutar `useEffect` za discipline recording, ali svaki put parsira IDB podatke. Treba keširati ili staviti u `useDeferredCompute`.

### B2. `GlobalSearch` učitava SVE source-ove i mindmap-e pri otvaranju
**Fajl:** `src/components/GlobalSearch.tsx` L60+
Pri svakom otvaranju searcha, `loadSources()` i `loadMindMaps()` dohvataju kompletne kolekcije. Za veliku bazu (stotine izvora) ovo je sporo.
**Fix:** Keširati source/mindmap naslove u memoriji, lazy-load sadržaj samo pri drill-down.

### B3. `framer-motion` importovan u 52 fajla
Framer-motion je veliki bundle (~32KB gzip). Koristi se uglavnom za `fade-in` animacije koje se mogu zamijeniti CSS tranzicijama. Svaki lazy-loaded route ga vuče kao dependency.
**Preporuka:** Za jednostavne `opacity+y` animacije, kreirati `<FadeIn>` wrapper koji koristi CSS `@keyframes` umjesto framer-motion. Zadržati framer samo za `AnimatePresence` i kompleksne layout animacije.

### B4. `content-visibility: auto` na `main > *` može izazvati CLS
**Fajl:** `src/index.css` L739-742
`contain-intrinsic-size: auto 500px` pretpostavlja 500px visinu za sav sadržaj. Za kratke stranice (Settings, Create) ovo uzrokuje vidljivi layout jump.
**Fix:** Ukloniti ovaj globalni rule ili ga primijeniti samo na poznato teške rute.

---

## C. ARCHITEKTURALNI PROPUSTI

### C1. `loadPlanner()` je sinhrona ali pristupa IDB cache-u
`loadPlanner()` vraća in-memory cache koji se inicijalizira asinhrono u `initPlannerCache()`. Ako se pozove prije nego IDB boot završi, vraća default config. Dashboard, NudgeWatcher i usePlannerData svi koriste ovu funkciju — potencijalno neinicijalizovani podaci.
**Fix:** Dodati `ready` guard u `usePlannerData` koji čeka na `useCardData().ready`.

### C2. Dupla Toaster instanca
**Fajl:** `src/App.tsx` L40-41
Aplikacija renderuje i `<Toaster />` (radix) i `<Sonner />` (sonner). Neki fajlovi koriste `import { toast } from "sonner"` a neki `import { useToast } from "@/hooks/use-toast"`. Ovo znači da se iste poruke mogu prikazati na dva različita mjesta ili se stilski sukobiti.
**Fix:** Standardizovati na jednu toast biblioteku (sonner, jer je lakša i češće korištena).

### C3. `ReviewSession` koristi `localStorage` direktno umjesto IDB
**Fajl:** `src/components/ReviewSession.tsx` L29-44
Sačuvana sesija se čuva u `localStorage` dok ostatak aplikacije koristi IDB. Nekonzistentno i može uzrokovati kvota probleme.

---

## D. UI OPTIMIZACIJE

### D1. Filter dropdown u `CardViewMode` — UUID prikazan umjesto imena
Kao gore (A1). Korisnik vidi `"f3a2b1c4-..."` umjesto "Krivično pravo".

### D2. Sidebar kategorije — nedostaje vizuelni indikator progresa
Sidebar (`AppSidebar.tsx`) prikazuje kategorije sa badge brojem kartica, ali nema vizuelnog indikatora koliki procenat kategorije je savladan (npr. mini progress bar ili color-coded dot).

### D3. Dashboard — previše widgeta bez hijerarhije
Dashboard renderuje do 7 widgeta vertikalno. Na ekranu od 888px, korisnik mora skrolovati. Nema vizuelnog grupisanja niti prioritizacije.
**Preporuka:** Grupisati u 2 kolone za desktop layout — lijeva za akcione widgete (CoreStats, DailyBriefing), desna za analitičke (Velocity, IdealFocus).

### D4. `glass-card` nema `backdrop-filter`
**Fajl:** `src/index.css` L684-688
Klasa `glass-card` ima `background: hsl(var(--card) / 0.75)` ali nedostaje `backdrop-filter: blur(...)` što bi dao pravi glassmorphism efekat. Trenutno izgleda kao obična polu-transparentna kartica.

### D5. Empty state ikone — nedostaje konzistentnost
Različite stranice koriste različite stilove za empty state: neke imaju ikonicu + tekst + CTA dugme (Sources tab), neke samo tekst (CardList). Treba standardizovati na jedinstven `<EmptyState>` pattern.

### D6. Subcategory/Chapter filteri ne prikazuju broj kartica
U `CardViewMode`, dropdown filteri ne prikazuju koliko kartica svaka potkategorija/glava sadrži. Korisnik mora probati svaki filter da vidi sadržaj.

---

## E. PLAN IMPLEMENTACIJE (prioritet)

### Tier 1 — Bugfixes (odmah)
| # | Fajl | Opis |
|---|------|------|
| A1 | `CardViewMode.tsx` | UUID→ime u filterima |
| A2 | `MainLayout.tsx` | Proslijediti reviewLog u NudgeWatcher |
| A4 | `OperationsTab.tsx` | Fix handleRebalance da sprema rezultat |
| A3 | `planner-storage.ts` | Transakcija za discipline save |

### Tier 2 — Performance (sljedeći korak)
| # | Fajl | Opis |
|---|------|------|
| B4 | `index.css` | Ukloniti `content-visibility` globalni rule |
| B2 | `GlobalSearch.tsx` | Keširati source/mindmap titles |
| C2 | `App.tsx` | Ukloniti duplicirani Toaster |

### Tier 3 — UI poboljšanja (nakon stabilizacije)
| # | Opis |
|---|------|
| D3 | Dashboard 2-column layout za desktop |
| D4 | Glassmorphism backdrop-filter |
| D6 | Broj kartica u filter dropdownima |
| D2 | Mini progress bar u sidebar kategorijama |

## Scope ukupno
- **4 buga** za hitni fix
- **3 performance** optimizacije
- **4 UI** poboljšanja
- ~12 fajlova, ~150 linija neto promjena

