

# Analiza eksterne revizije — Verifikacija i plan

## Rezultat verifikacije

### 1.1. "Zamka globalnog konteksta" — ❌ NETAČNO

Analiza tvrdi da `AppContext` koristi `useLiveQuery` za sve kartice. **Ovo nije slučaj.**

Stvarno stanje:
- `AppContext` je dekomponovan na **3 granularna konteksta**: `CardStateContext`, `CategoryStateContext`, `ReviewStateContext`
- `useCards` hook koristi **Ref-Delta pattern** sa `useState` + `cardMapRef` — **nema `useLiveQuery`** u kontekstu
- `useLiveQuery` se koristi samo na **jednom mjestu** u cijeloj app — `CategoryView.tsx` (za `sources` i `mindMapCount`), i to sa filtriranim upitima po `categoryId`, ne `toArray()`
- Review sesija mutira kartice kroz `schedulePersist` → ažurira samo `cardMap` u memoriji, ne okida globalni re-render

**Zaključak**: Ovaj problem je već riješen. Nema akcije.

---

### 1.2. "Monolitni Zustand Store" — ❌ NETAČNO

Analiza tvrdi da SourceReader store drži teške podatke i nema granularne selektore.

Stvarno stanje:
- `useSourceReaderStore` drži **isključivo UI stanje** (boolean flagove, selekcije, dialog state)
- **Svi selektori su već granularni**: `useSourceReaderStore(s => s.viewMode)`, `s => s.editMode`, itd. — 14 zasebnih selektora u `SourceReader.tsx`
- Teški podaci (parsirani tekst, kartice) dolaze iz `useSourceReaderActions` hook-a, ne iz store-a

**Zaključak**: Već implementirano. Nema akcije.

---

### 2.1. "Curenje memorije preko Event Bus-a" — ❌ NETAČNO

Analiza tvrdi da postoji rizik od zaboravljenih cleanup-a.

Stvarno stanje — svih 5 pretplata u kodu:
- `useCards.ts` L101: `return eventBus.subscribe(...)` ✓
- `MnemonicModule.tsx` L69: `return unsub` ✓
- `GlobalSearch.tsx` L72: `return eventBus.subscribe(...)` ✓
- `CategoryMindMaps.tsx` L26: `return unsub` ✓
- `BlockingModal.tsx` L15-21: vraća cleanup koji poziva oba unsub-a ✓

**Zaključak**: Sve pretplate imaju cleanup. Nema curenja. Nema akcije.

---

### 2.2. "Branded Types za UUID" — ⚠️ TAČNO ALI NISKO PRIORITETNO

Istina je da se koristi `string` za sve ID-jeve. Branded types bi dodali type safety, ali:
- Projekat već koristi striktnu `Id` sufiksnu konvenciju (`categoryId`, `subcategoryId`, `chapterId`)
- Uvođenje branded types zahtijeva refaktoring 100+ fajlova — ogroman scope za marginalan benefit
- Nijedan bug u sistemu nije nastao zbog zamjene tipova ID-jeva

**Zaključak**: Teoretski korisno, praktično neproporcionalano. Preskočiti.

---

### 3.1. "Persist Queue gubitak podataka" — ❌ NETAČNO

Analiza tvrdi da nema zaštite pri zatvaranju taba.

Stvarno stanje — **tri sloja zaštite** već postoje:
1. `visibilitychange` handler (L105-110) — flush pri skrivanju taba
2. `beforeunload` handler u `main.tsx` (L178) — poziva `cleanup()` koji flush-uje queue
3. `sessionStorage` flag `codex-flush-pending` — detektuje prekinute upisne pri ponovnom pokretanju

**Zaključak**: Potpuno pokriveno. Nema akcije.

---

### 3.2. "Worker timeout i error handling" — ❌ NETAČNO

Analiza tvrdi da nema timeout mehanizma i error handling-a za workere.

Stvarno stanje u `docx-parser.ts`:
- **30s timeout** sa `worker.terminate()` ✓
- `worker.onerror` sa **fallback na main thread** ✓
- `settled` flag sprječava duple resolve/reject pozive ✓
- ZIP worker ima try/catch sa `postMessage({ success: false, error })` ✓

**Zaključak**: Već implementirano. Nema akcije.

---

## Ukupan rezultat

| Tvrdnja | Tačna? | Već riješeno? |
|---------|--------|---------------|
| 1.1 Globalni kontekst | ❌ | Da — dekomponovan na 3 konteksta |
| 1.2 Monolitni Zustand | ❌ | Da — granularni selektori |
| 2.1 Event Bus leak | ❌ | Da — svi cleanup-i postoje |
| 2.2 Branded Types | ⚠️ | Nisko prioritetno |
| 3.1 Persist Queue | ❌ | Da — 3 sloja zaštite |
| 3.2 Worker errors | ❌ | Da — timeout + fallback |

**Od 6 tvrdnji, 5 je netačno** — problemi koje analiza opisuje su već riješeni u ovom projektu. Jedina validna tvrdnja (Branded Types) je niskoprioritetan refaktoring sa neproporcionalnim scope-om.

**Nema potrebe za planom popravki** jer nema šta da se popravlja.

