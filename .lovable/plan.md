

# Deep Audit: Arhitektura, greške, uska grla i optimizacije

## 1. GREŠKE I SIGURNOSNI RIZICI

### 1.1 XSS — nesanitizovan `dangerouslySetInnerHTML` (VISOK RIZIK)
**`src/components/workshop/WorkshopCardItem.tsx:191`** — `s.content` se renderuje direktno bez `sanitizeHtml()`:
```tsx
dangerouslySetInnerHTML={{ __html: s.content }}
```
Svi ostali `dangerouslySetInnerHTML` pozivi koriste `sanitizeHtml()` ili `highlightKeyParts()` (koji interno sanitizuje). Ovo je jedina nesanitizovana tačka.

**Fix**: Zamijeni sa `sanitizeHtml(s.content)`.

### 1.2 `any` kastovi — 27 `as any` u produkcijskom kodu
Koncentrisani u:
- `useCardBootstrap.ts` (migracija legacy podataka) — opravdano za backward compat
- `useCardImport.ts` (import nepoznatih formata) — opravdano ali treba type guard
- `useMindMapCanvas.ts` (čišćenje callback-ova iz node data) — treba interfejs
- `useCategoryManagement.ts` — isti legacy pattern

**Rizik**: Nizak u praksi jer su svi u migracijskim/import putanjama, ali smanjuje TypeScript zaštitu.

### 1.3 `SourceContent.tsx` — `dangerouslySetInnerHTML` bez eksplicitnog sanitize poziva
Treba provjeriti da li se `htmlContent` sanitizuje prije renderovanja u SourceReader putanji.

---

## 2. USKA GRLA PERFORMANSI

### 2.1 `useDashboardData` — previše kalkulacija na svakom renderu
Hook poziva **6 `useDeferredCompute`** hook-ova i **7 `useMemo`** kalkulacija. Svaki od `useDeferredCompute` poziva sinhrone funkcije poput `loadPlanner()`, `loadSlippageLog()`, `loadDisciplineLog()` koje čitaju iz in-memory keša ili IDB. Ovo radi OK dok je dataset mali ali:
- `calcVelocity(reviewLog, 7)` se poziva **3 puta** sa istim argumentima (linija 146, 184, 213)
- `loadPlanner()` se poziva **2 puta** (linija 144, 203)
- `getSmartSuggestion()` se poziva **2 puta** (linija 150, 213)

**Fix**: Konsolidovati u jedan `useDeferredCompute` koji vraća sav planner data, eliminisati duplikate.

### 2.2 `useCards` derived data — O(n) jednoprolazna kalkulacija je OK
Single-pass `useMemo` za `dueCards/stats/categoryStats` (linija 158-232) je dobro optimizovan. Nema problema ovdje.

### 2.3 `CategoryView` — 498 linija, i dalje najteža komponenta
Sadrži inline logiku za:
- DOCX import
- Source delete dialog (sa async handler-om unutar JSX-a)
- Knowledge map toggle

Mogla bi se razbiti na `SourcesTab` komponentu (~150 linija manje).

### 2.4 `MindMapNode.tsx` — 390 linija
Najveća prezentaciona komponenta. Sadrži inline editing, resize, icon registry, i color picker. Kandidat za dekompoziciju ali funkcionalno stabilan jer koristi `memo`.

### 2.5 `sources` filter u CategoryView — dvostruko filtriranje
```tsx
sources.filter(s => (s.sourceKind ?? "propis") === "propis").length  // za badge
sources.filter(s => (s.sourceKind ?? "propis") === kind)              // za listu
```
Filtrira se 2× za badge + 2× za sadržaj (ukupno 4 prolaza). Trebalo bi memoizovati.

---

## 3. ARHITEKTONSKE PRILIKE

### 3.1 Kontekst dekompozicija — ODLIČNA
Razdvajanje na `CardState`, `CategoryState`, `ReviewState`, `Actions` (Proxy pattern) i `Pomodoro` kontekste je izvanredno. Proxy-based actions nikad ne re-renderuju potrošače. Ovo je state-of-the-art za React kontekst.

### 3.2 Persist Queue — SOLIDNA
Micro-batching (16ms debounce), visibility change flush, interrupted write detection — sve je na mjestu. Jedina sitna primjedba: `flush()` se poziva fire-and-forget u `cleanup()` — ako tab zatvori za vrijeme pisanja, nema garancije da će se završiti (ali `sessionStorage` flag to detektuje).

### 3.3 Boot proces — ROBUSTAN
8s panic timer, fazni splash progress, withTimeout sa fallback-ovima, lazy migracije — dobro dizajnirano za offline-first app.

### 3.4 `useLiveQuery` izolacija — ODLIČNA
Samo 1 fajl koristi `useLiveQuery` (`CategoryView.tsx`) — za `sources` i `mindMapCount`. Svi ostali podaci dolaze iz konteksta. Ovo je čisto.

---

## 4. PREPORUKE ZA IMPLEMENTACIJU (po prioritetu)

### P1 — Sanitizuj WorkshopCardItem (5 min)
Jedna linija fix, eliminira XSS vektor.

### P2 — Memoizuj filtrirane izvore u CategoryView (10 min)
Dodaj `useMemo` za `propisSources` i `skriptaSources` umjesto inline `.filter()`.

### P3 — Eliminiši duplikate u useDashboardData (30 min)
Konsoliduj `calcVelocity`, `loadPlanner`, `getSmartSuggestion` u jedan `useDeferredCompute`.

### P4 — Ekstrahuj SourcesTab iz CategoryView (45 min)
Izdvoji ~150 linija import/delete/list logike u `components/category/SourcesTab.tsx`.

### P5 — Type guard-ovi za import putanje (60 min)
Zamijeni `as any[]` kastove u `useCardImport.ts` sa runtime validation funkcijama.

---

## 5. ZDRAVSTVENI INDIKATORI

| Metrika | Vrijednost | Ocjena |
|---------|-----------|--------|
| `useLiveQuery` leak | 1 fajl (izolovano) | ✅ Odlično |
| `as any` kastovi | 27 | ⚠️ Prihvatljivo (migracijski kod) |
| XSS tačke | 1 nesanitizovana | ❌ Fixaj odmah |
| Najveća komponenta | 498 linija (CategoryView) | ⚠️ Kandidat za split |
| Duplirane kalkulacije | 3 u useDashboardData | ⚠️ Optimizuj |
| Console statements | 93 | ℹ️ Većina DEV-only guarded |
| Bundle lazy loading | Sve rute + teške lib | ✅ Odlično |
| Kontekst granularnost | 5 konteksta + Proxy actions | ✅ Izvanredno |
| DB recovery | Timeout + version reset + panic | ✅ Robustno |
| Persist integrity | Micro-batch + flush-on-hide | ✅ Solidno |

**Ukupna ocjena: 8.5/10** — Arhitektura je zrela, sa jednim sigurnosnim propustom i nekoliko optimizacijskih prilika.

