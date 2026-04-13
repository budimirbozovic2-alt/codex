

# Deep Audit — Arhitektura i kod

## Rezime

Aplikacija je arhitektonski zrela: dekompozicija konteksta, persist-queue, event-bus, sanitizacija — sve na visokom nivou. Pronašao sam **11 konkretnih problema** grupisanih po prioritetu.

---

## KRITIČNI (potencijalni gubitak podataka / sigurnost)

### K1. `highlightMatch` u GlobalSearch ne sanitizira izlaz
`GlobalSearch.tsx:44` — funkcija `highlightMatch` poziva `sanitizeHtml(text)` samo kad je `query` prazan. Kad postoji query, rezultat regex zamjene se koristi u `dangerouslySetInnerHTML` **bez sanitizacije**. Ako korisnik imenuje karticu sa `<img onerror=...>`, XSS je moguć.

**Fix:** Dodati `sanitizeHtml()` na kraju `highlightMatch` (isti pattern kao `highlightKeyParts`).

### K2. Persist queue `cleanup()` poziva `flush()` fire-and-forget pri unmount-u
`persist-queue.ts:92` — `flush()` je async ali se poziva bez `await`. Pri zatvaranju taba, podaci u `pending` nizu mogu biti izgubljeni jer browser prekine execution prije nego `idbBulkPutCards` završi.

**Fix:** Koristiti `navigator.sendBeacon` ili sinhroni `visibilitychange` handler sa `keepalive` flagom. Alternativno, dokumentovati ograničenje.

---

## VISOKI PRIORITET (performanse / maintainability)

### V1. `useDashboardData` poziva `getSmartSuggestion` i `autoRedistributeIfNeeded` 2× redundantno
Linije 151 i 156 oba pozivaju te funkcije. Zatim `studyFlowData` (linija 213) ponovo poziva `getSmartSuggestion`. Tri poziva iste skupe funkcije po render ciklusu.

**Fix:** Izračunati jednom i proslijediti rezultat.

### V2. `useDashboardData` ima 14 `useMemo`/`useDeferredCompute` poziva u jednom hook-u
To je teško za praćenje i debug. Neki imaju identične dependency nizove (npr. `velocity7` + `reviewLog`).

**Fix:** Grupisati povezane kalkulacije u 2-3 veća `useMemo` bloka.

### V3. `LearnSession.tsx:52` — `(catRec as any).subcategories`
`catRec` je tipa `CategoryRecord` koji **već ima** `subcategories: SubcategoryNode[]`. Cast na `any` je nepotreban i maskira potencijalne greške.

**Fix:** Ukloniti `as any` cast.

### V4. 6 preostalih `as any` na raznim mjestima
`HealthMonitor.tsx:275`, `SourceEditToolbar.tsx:67`, `ExportToCategory.tsx:37`, `MajorSystemSettings.tsx:38`, `main.tsx:192`. Svaki je mali rizik za type safety.

**Fix:** Zamijeniti preciznim tipovima.

---

## SREDNJI PRIORITET (code quality / maintenance)

### S1. ~90 `console.log` poziva (od kojih ~75 iza `import.meta.env.DEV` guard-a)
Većina boot logova su zaštićena DEV guardom — to je OK. Ali 3 produkcijska `console.log` bez guarda:
- `mnemonic-storage.ts:115`
- `db-seed.ts:37`
- `AutoSplitDialog.tsx:255`

**Fix:** Ukloniti ili prebaciti u `console.debug` / DEV guard.

### S2. `EventBus` singleton ne čisti se pri HMR
`event-bus.ts:163` — `new EventBus()` se kreira pri svakom HMR reload-u, akumulirajući BroadcastChannel konekcije. `destroy()` metoda postoji ali se nigdje ne poziva.

**Fix:** Dodati HMR cleanup: `if (import.meta.hot) import.meta.hot.dispose(() => eventBus.destroy())`.

### S3. Breadcrumbs vjerovatno koristi stari naziv "Dashboard"
Provjeriti da li `Breadcrumbs.tsx` mapira `/` rutu na "Dashboard" umjesto "Početna tabla".

**Fix:** Ažurirati label u Breadcrumbs.

### S4. 19 praznih `catch` blokova
Većina su legitimni (localStorage/sessionStorage operacije u ErrorBoundary). Ali treba dodati barem `console.debug` u `ReviewSession.tsx:41` koji može tiho progutati grešku pri restorovanju sesije.

---

## NISKI PRIORITET (optimizacija)

### N1. `db-schema.ts` — `setInterval` za unblock nikad se ne čisti ako tab ostane otvoren
Linija 180 — interval od 2s traje zauvijek čak i kad nema greške. Mala memorijska cijena ali nepotrebna.

**Fix:** Pokretati interval samo kad `dbErrorState` postane non-null.

---

## Šta je DOBRO (ne treba mijenjati)

- DOMPurify sanitizacija na svim `dangerouslySetInnerHTML` tačkama (osim K1)
- Dekompozicija konteksta na 5 providera — sprečava cascade re-rendere
- Proxy pattern za stabilne action reference — odlično rješenje
- Single-pass O(n) derivacija `dueCards`/`stats`/`categoryStats`
- Boot trace sistem sa timeout guardom
- `key={categoryId}` za remount CategoryView

## Scope implementacije

**8-10 fajlova**, od čega su K1 i S1 jednolinersi. Najsloženija izmjena je V1 (refaktoring `useDashboardData`). Ukupno ~2h rada.

