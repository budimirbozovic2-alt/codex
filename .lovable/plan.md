

# Analiza Single Source of Truth (SSoT)

## Ocjena: **8/10** — Dobar, sa 3 preostala narušavanja

Aplikacija je prošla značajan refaktoring i većina podataka ima čist SSoT. Evo pregleda po segmentima:

---

## ✅ Segmenti sa čistim SSoT

### Kartice (Cards)
- **Kanonski izvor**: `cardMap` u `useCards.ts` (in-memory)
- **Perzistencija**: isključivo kroz `idbPutCard` / `idbBulkPutCards` / `idbDeleteCard` u `db-queries.ts`
- **Ref-Delta pattern**: `cardMapRef` se mutira sinhrono prije IDB upisa — nema race condition-a
- **Status**: ✅ Čist SSoT

### Kategorije (Categories)
- **Kanonski izvor**: `categoryRecords` u `useCards.ts`
- **Derivati**: `categories` (UUID lista) i `subcategories` (mapa) su `useMemo` derivati
- **Mutacije**: centralizirane kroz `useCategoryManagement`
- **Status**: ✅ Čist SSoT

### SR Settings
- **Kanonski izvor**: `srSettings` state u `useCards.ts`, perzistiran u IDB settings tabeli
- **Status**: ✅ Čist SSoT

### Sources
- **Kanonski izvor**: `sources-storage.ts` sa cache + IDB
- **Status**: ✅ Čist SSoT (sa listener pattern za card link cleanup)

### Mind Maps
- **Kanonski izvor**: IDB direktno, čitanje kroz `useLiveQuery` ili `mindmap-storage.ts`
- **Status**: ✅ Čist SSoT

---

## ⚠️ Narušavanja SSoT (3 problema)

### Problem 1: `LearnModal.tsx` — nezavisni `useLiveQuery` za kategorije
**Fajl**: `src/components/mental-skeleton/LearnModal.tsx` L28
```
const catRecord = useLiveQuery(() => db.categories.get(card.categoryId), ...)
```
Čita kategorije direktno iz IDB umjesto da koristi `categoryRecords` iz konteksta. Ovo je isti tip problema koji smo već riješili u 6 drugih komponenti.

**Fix**: Proslijediti `categoryRecords` kao prop ili koristiti `useCategoryData()`.

### Problem 2: `AppSettings` — dual storage (localStorage + IDB)
**Fajl**: `src/lib/app-settings.ts`
```
saveAppSettings → piše u localStorage + IDB
loadAppSettingsAsync → čita localStorage, fallback na IDB
```
Dva izvora istine za iste podatke. Ako se IDB ažurira ali localStorage ne (quota, privatni mode), nastaje divergencija.

**Status**: Svjesna odluka za performanse (sync čitanje). Nizak rizik jer je IDB fallback, ali tehnički narušava SSoT.

### Problem 3: `useCategoryManagement.ts` — direktan `db.cards.bulkDelete` mimo persist-queue
**Fajl**: `src/hooks/useCategoryManagement.ts` L90
```
await db.cards.bulkDelete(toDelete)
```
Zaobilazi centralizovani `idbDeleteCard` iz `db-queries.ts`. Stanje se ažurira u memoriji, ali IDB operacija ne prolazi kroz isti kanal kao ostale card mutacije.

**Status**: Funkcionalno ispravno (state se ažurira), ali narušava princip jednog ulaza za card operacije.

---

## Rezime

| Segment | SSoT status | Napomena |
|---------|-------------|----------|
| Cards (state) | ✅ | cardMap + Ref-Delta |
| Categories | ✅ | categoryRecords jedini izvor |
| SR Settings | ✅ | IDB settings |
| Sources | ✅ | cache + IDB |
| Mind Maps | ✅ | IDB direct |
| Review Log | ✅ | state + IDB |
| LearnModal kategorije | ⚠️ | useLiveQuery mimo konteksta |
| AppSettings | ⚠️ | dual localStorage/IDB |
| Category delete → cards | ⚠️ | direktan db.cards poziv |

Sva tri problema su nisko-rizična i ne uzrokuju bugove u praksi, ali ih vrijedi popraviti za arhitektonsku čistoću.

