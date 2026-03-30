

# Deep Audit — Golden Master Readiness Report

---

## 🔴 KRITIČNI RIZICI (Showstoppers)

### 1. Import koristi `r.name` umjesto `r.id` za kategorije (DATA CORRUPTION)
**Fajl:** `src/hooks/useCardImport.ts`, linije 129 i 145

```
setCategories(() => freshRecords.map(r => r.name));  // LINIJA 129 — šalje NAZIVE umjesto UUID-ova
subMap[r.name] = ...                                  // LINIJA 145 — ključ je NAME, treba biti r.id
```

**Posljedica:** Nakon importa v7+ backupa, `categories` state sadrži nazive umjesto UUID-ova. Sve operacije koje zavise od UUID match-a (filteri, statistika, org mode) prestaju raditi. Korisnik mora ručno osvježiti aplikaciju i ponovo importovati.

**Fix:** Zamijeni `r.name` sa `r.id` na oba mjesta.

---

### 2. `renameCategory` koristi stari naziv za Source migraciju (SILENT DATA LOSS)
**Fajl:** `src/hooks/useCategoryManagement.ts`, linije 58 i 76

```ts
const legacyCards = await db.cards.where("categoryId").equals(record?.name || "").toArray();
// ...
await db.sources.where("categoryId").equals(record.name).modify({ categoryId });
```

**Posljedica:** Legacy migracija traži kartice čiji `categoryId` je stari NAZIV. Ali kartice već koriste UUID. Ovaj kod zapravo ne radi ništa za normalne kartice — ali ako se pozove na Source tabeli, `record.name` nikada neće matchovati `categoryId` koji je UUID. Sources se nikada ne migriraju pri rename-u.

**Fix:** Ukloni legacy card migration (dead code). Za sources, koristi `record.id` (UUID) jer sources već koriste UUID u `categoryId`.

---

### 3. Persist Queue: jedan neuspjeli `idbDeleteCard` ruši ostatak batch-a
**Fajl:** `src/lib/persist-queue.ts`, linije 59-60

```ts
if (puts.length > 0) await idbBulkPutCards(puts);
for (const id of deletes) await idbDeleteCard(id);  // Serijski — ako jedno padne, ostala se preskaču
```

**Posljedica:** Ako `idbDeleteCard` baci grešku za jednu karticu (npr. korupcija), catch blok hvata SVE i preostale delete operacije se nikada ne izvrše. Korisnik može završiti sa "zombie" karticama u IDB koje se nikada ne brišu.

**Fix:** Zamijeni `for` petlju sa `Promise.allSettled` ili individualni try/catch unutar petlje:
```ts
await Promise.allSettled(deletes.map(id => idbDeleteCard(id)));
```

---

## 🟡 UPOZORENJA (Warnings)

### 4. `useLiveQuery` u leaf komponentama — krši "boot-load-all" arhitekturu
**Fajlovi:** `SessionHeader.tsx`, `ReviewCard.tsx`, `CardList.tsx`, `WorkshopCardItem.tsx`, `LearnModal.tsx`, `CategoryView.tsx`

7 komponenti koristi `useLiveQuery` za individualne IDB čitanja (npr. `db.categories.get(card.categoryId)`). Ovo znači da svaka kartica u listi otvara zasebnu IDB transakciju. Sa 200+ kartica u listi, to je 200 IDB čitanja umjesto jednog lookup-a iz memorije.

**Preporuka:** Zamijeniti sa in-memory `categoryRecords` lookup-om koji već postoji u kontekstu. `CategoryView.tsx` je izuzetak — koristi `useLiveQuery` za filtered queries po `categoryId`, što je opravdano jer ta stranica ne koristi globalni `cards` niz.

---

### 5. `CategoryView.tsx` koristi paralelni data source — rizik od stale data
**Fajl:** `src/views/CategoryView.tsx`

`CategoryView` učitava kartice direktno iz IDB (`useLiveQuery`) umjesto iz `useCardContext().cards`. To znači da mutacije koje se dešavaju u kontekstu (npr. drag-and-drop reorder u OrgMode) neće biti odmah vidljive dok se IDB transakcija ne commituje (~16ms delay).

**Posljedica:** Minor UX bug — korisnik može vidjeti kratki flicker. Nije data loss ali je nekonzistentnost.

**Preporuka:** Razmotriti korištenje filtrirane liste iz konteksta umjesto paralelnog IDB query-a, ili prihvatiti kao trade-off (IDB queries su točniji ali sporiji).

---

### 6. Electron build: nedostaje `asar: true` i `extraResources`
**Fajl:** `package.json`, sekcija `"build"`

electron-builder config nema:
- `asar: true` (default je true, ali eksplicitno ga postaviti je best practice)
- `extraResources` za `preload.cjs` — preload mora biti izvan ASAR arhive jer Chromium ne može čitati preload iz asar-a
- `afterSign` hook za macOS notarization (potreban za distribuciju na macOS 10.15+)

**Fix:** Dodati u `package.json` build sekciju:
```json
"asar": true,
"extraFiles": [
  { "from": "preload.cjs", "to": "preload.cjs" }
]
```

---

### 7. `window.cjs`: `ipcMain.handle('window-is-maximized')` se ne čisti pri crash recovery
**Fajl:** `electron/window.cjs`, linija 174

Postoji `try { ipcMain.removeHandler('window-is-maximized'); } catch (_) {}` — ovo je ispravno. Ali `ipcMain.on('renderer-ready')` koristi `once` na liniji 214, dok je na liniji 175 `removeListener`. Ako renderer nikada ne pošalje `renderer-ready` (crash prije ready), listener ostaje zauvijek. Ovo se ispravno rješava na liniji 175 u crash recovery bloku.

**Verdict:** Kod je ispravan — ovo je samo napomena za future reference.

---

### 8. Pomodoro timer: `setInterval` unutar `setSeconds` updater
**Fajl:** `src/contexts/AppContext.tsx`, linije 199-224

`setSeconds` callback sadrži `setRunning(false)`, `setCycleCount`, i `setMode` pozive — setState unutar setState. Ovo radi u praksi jer React batching ih obrađuje, ali je anti-pattern. Ako se ikada promijeni React verzija, ponašanje se može promijeniti.

**Preporuka:** Koristiti `useReducer` za pomodoro state umjesto višestrukih `useState` hook-ova.

---

### 9. Backup `subcategories` map koristi `r.name` umjesto `r.id` kao ključ
**Fajl:** `src/main.tsx`, linija 111

```ts
subcategories[r.name] = r.subcategories.map(...)
```

Backup čuva subcategories mapu sa imenom kategorije kao ključem, dok runtime koristi UUID. Ovo znači da pri importu subcategories mapa može biti neupotrebljiva jer ključevi ne matchuju.

**Fix:** `subcategories[r.id] = ...`

---

### 10. Crash log u `localStorage` raste neograničeno
**Fajl:** `src/components/ErrorBoundary.tsx`, linija 39

MAX_ENTRIES je 50, ali svaki entry sadrži `componentStack` koji može biti 2-5KB. Sa 50 entry-ja to je do 250KB u localStorage. Nije kritično ali troši quota.

**Preporuka:** Smanjiti MAX_ENTRIES na 20 ili ograničiti `componentStack` na prvih 500 karaktera.

---

## 🟢 PREPORUKE ZA OPTIMIZACIJU

### 11. `mapToArray` koristi globalni modul-level cache
**Fajl:** `src/lib/persist-queue.ts`

`_mapVersion`, `_cachedVersion`, `_cachedArray` su globalne varijable. Ovo je OK za single-page app, ali ako ikada dođe do HMR reloada u developmentu, cache može sadržavati stale reference. Već je riješeno sa `bumpMapVersion()` pozivima — samo napomena.

---

### 12. `QueryClient` se kreira na svakom renderovanju `App` komponente
**Fajl:** `src/App.tsx`, linija 39

```ts
const queryClient = new QueryClient();
```

Ovo je izvan komponente na modul nivou — **ispravno**. Nema problema.

---

### 13. Error Boundary pokrivenost
**Status:** DOBRA — svaka ruta u `App.tsx` ima svoj `ErrorBoundary` sa `label` propom. Postoji i root-level `ErrorBoundary` oko cijelog `MainLayout`. Emergency backup je dostupan. IPC logging u Electron okruženju radi.

---

### 14. `window.cjs` preload putanja je hardkodovana identično za dev i prod
**Fajl:** `electron/window.cjs`, linije 87-89

```js
preload: isDev
  ? path.join(baseDir, 'preload.cjs')
  : path.join(baseDir, 'preload.cjs'),
```

Ternary je beskoristan — obje grane su identične. Možda je bila namjera da prod putanja bude drugačija (npr. `resources/preload.cjs`). Provjeriti da li electron-builder kopira `preload.cjs` u root build direktorija.

---

## SAŽETAK PRIORITETA

| # | Tip | Opis | Hitnost |
|---|-----|------|---------|
| 1 | 🔴 | Import: `r.name` umjesto `r.id` za kategorije | **ODMAH** |
| 2 | 🔴 | renameCategory: dead code + Source migration ne radi | **ODMAH** |
| 3 | 🔴 | Persist queue: serijski deletes mogu pasti | **ODMAH** |
| 9 | 🟡 | Backup subcategories: `r.name` umjesto `r.id` | **ODMAH** (uz #1) |
| 4 | 🟡 | useLiveQuery u leaf komponentama | Nakon GM |
| 5 | 🟡 | CategoryView paralelni data source | Nakon GM |
| 6 | 🟡 | Electron build config: asar + extraFiles | Prije distribucije |
| 8 | 🟡 | Pomodoro anti-pattern | Nakon GM |
| 10 | 🟡 | Crash log veličina | Nakon GM |
| 14 | 🟢 | Redundantni ternary u preload putanji | Trivijalno |

Čekam tvoju komandu koje tačke da implementiram.

