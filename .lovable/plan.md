

# Deep Audit: Arhitektura, greške, uska grla i optimizacija

## Rezime nalaza

Aplikacija je solidno arhitekturirana sa Ref-Delta persistencijom, granularnim kontekstima, i dobrom dekompozicijom. Ipak, identifikovano je 12 problema u 4 kategorije.

---

## 1. MRTAV KOD I NEISKORIŠTENE ZAVISNOSTI

### 1.1 Nekorišteni paketi (bundle bloat)
- **`next-themes`** — koristi se samo u `sonner.tsx` za `useTheme()`, ali aplikacija ručno upravlja dark modom (`app-settings.ts`). `useTheme()` vjerovatno vraća "system" jer nema `ThemeProvider`. Sonner wrapper treba zamijeniti da čita dark mode direktno iz DOM-a.
- **`@radix-ui/react-toast`** — kompletno nekorišten. Fajlovi `ui/toast.tsx`, `ui/toaster.tsx`, `hooks/use-toast.ts` nemaju nijednog potrošača. Samo `sonner` se koristi (28 import-a).
- **`@radix-ui/react-toggle-group`** — nema nijednog import-a u cijelom `src/`.

**Akcija**: Ukloniti 3 paketa iz `package.json`, obrisati 3 mrtva fajla, preraditi `sonner.tsx`.

### 1.2 Dupli fajl `main.tsx` u root-u
- Postoji `main.tsx` u root-u projekta (pored `src/main.tsx`). Root verzija sadrži neispravan kod (`ImportColorTheme`, `render`) koji se nikad ne izvršava. Konfuzan artefakt.

**Akcija**: Obrisati `main.tsx` iz root-a.

---

## 2. USKA GRLA PERFORMANSI

### 2.1 `highlightKeyParts` — O(n×k) regex na svaki render
U `highlight-key-parts.ts`, svaki poziv kreira nove `RegExp` objekte i poziva `sanitizeHtml` (DOMPurify). Ovo se dešava na svakom renderu `ReviewCard`, `StudyModeFree/Recall/Chain` — potencijalno skupa operacija za kartice sa mnogo key parts.

**Akcija**: Memoizirati rezultat u komponenti putem `useMemo` sa `[content, keyParts]` zavisnostima. Ne treba mijenjati samu funkciju.

### 2.2 `useCardBootstrap` — sinhrone `O(n²)` operacije pri boot-u
Linija 167: `c.filter(card => card.categoryId === r.id)` se izvršava za svaku kategoriju, ukupno `O(categories × cards)`. Za 10 kategorija × 5000 kartica = 50k iteracija.

**Akcija**: Izgraditi `Map<categoryId, Card[]>` jednom prije loop-a, svesti na `O(n)`.

### 2.3 `MindMapCanvas` — 407 linija, nije dalje dekomponovan
Jedina komponenta iznad 400 linija. Sadrži i logiku i renderovanje.

**Akcija**: Niskoprioritetno — funkcionalno je ispravno, ali bi moglo profitirati od izdvajanja hook-a.

---

## 3. POTENCIJALNE GREŠKE I RIZICI

### 3.1 `sonner.tsx` — `useTheme()` bez Provider-a
`useTheme()` iz `next-themes` se koristi ali `ThemeProvider` nigdje nije registrovan u `App.tsx`. To znači da `theme` uvijek vraća default ("system"), i Sonner ne prati stvarni dark/light mode aplikacije. Toast notifikacije mogu imati pogrešnu temu.

**Akcija**: Zamijeniti `useTheme()` sa direktnim čitanjem: `document.documentElement.classList.contains("dark") ? "dark" : "light"`.

### 3.2 `getPomodoroStats` — učitava SVE zapise bez filtriranja
`storage.ts:65`: `db.pomodoroLog.toArray()` učitava kompletnu historiju, pa tek onda filtrira u memoriji. Za korisnika sa godinom podataka ovo je nepotrebno opterećenje.

**Akcija**: Koristiti `db.pomodoroLog.where("timestamp").aboveOrEqual(weekStart).toArray()` za efikasnije filtriranje.

### 3.3 Silent catch blokovi (247 instanci)
Većina `catch {}` blokova je namjerna (localStorage fallback, audio cleanup), ali ~15-20 instanci guta greške bez ikakvog logovanja, što otežava debugging u produkciji.

**Akcija**: Dodati `console.warn("[silent]", e)` u kritične catch blokove (storage operacije, IDB operacije), ostaviti kozmetičke (localStorage čitanje) kakvi jesu.

### 3.4 `cardMapRef` sync pattern — potencijalni race condition
U `useCardCRUD.ts`, `bumpMapVersion()` se poziva NAKON `setCardMapState`, ali `useEffect` koji sinhronizuje `cardMapRef` sa `cardMap` se izvršava asinhrono. Između `setCardMapState` i efekta, `cardMapRef` je već ručno ažuriran, ali `mapToArray` cache se bump-uje prije nego state settne. Ovo je trenutno ispravno jer se ref mutira sinhrono prije `setCardMapState`, ali bi `bumpMapVersion` trebalo zvati konzistentno NAKON ref mutacije, ne nakon setState.

**Status**: Trenutno radi korektno. Dokumentovati pattern za buduće održavanje.

---

## 4. PROSTOR ZA OPTIMIZACIJU

### 4.1 `as any` kastovi — 20 instanci
Uglavnom u `useCardBootstrap.ts` (legacy migracija) i `event-bus.ts`. Prihvatljivo za migracioni kod, ali `EventMessage<T = any>` bi trebao koristiti `unknown`.

### 4.2 Boot logging — 19 `console.log/warn` u `useCardBootstrap`
Prekomjeran logging u produkciji. Trebalo bi usloviti sa `import.meta.env.DEV`.

### 4.3 `loadSources` globalni cache bez TTL
`sources-storage.ts` kešira SVE source-ove u `_cache` bez limita. Za korisnike sa stotinama izvora ovo drži memoriju zauzetu. Nije kritično jer se sources ažuriraju rijetko, ali treba imati na umu.

---

## Plan implementacije

| Prioritet | Zadatak | Fajlovi | Rizik |
|---|---|---|---|
| P1 | Popraviti Sonner temu (3.1) | `sonner.tsx` | Nizak |
| P1 | Ukloniti mrtve pakete i fajlove (1.1, 1.2) | `package.json`, 4 fajla | Nizak |
| P2 | Optimizovati boot O(n²) → O(n) (2.2) | `useCardBootstrap.ts` | Nizak |
| P2 | Optimizovati `getPomodoroStats` (3.2) | `storage.ts` | Nizak |
| P3 | Usloviti boot logging (4.2) | `useCardBootstrap.ts` | Nizak |
| P3 | Obrisati root `main.tsx` (1.2) | `main.tsx` | Nizak |

Ukupno: ~6 fajlova izmjena, 4 fajla brisanje, 3 paketa uklanjanje. Sve promjene su nisko-rizične i ne mijenjaju funkcionalnost.

