

# Dekompozicija useCards God Object → 3 konteksta

## Rezime

**Problem**: `CardDataContext` sadrži 12 polja (cards, categories, categoryRecords, subcategories, dueCards, stats, categoryStats, cardCountByCategory, reviewLog, srSettings, ready, dbError). Kad se promijeni bilo šta (npr. `reviewLog`), svi potrošači se re-renderuju — čak i oni koji koriste samo `categoryRecords`.

**Rješenje**: Razdvojiti `CardDataContext` na 3 granularna konteksta. `useCards()` hook ostaje kao interni orkestrator (jer state setteri su međusobno zavisni — bootstrap, import, cascade delete svi koriste više settera), ali AppContext distribuira podatke u 3 odvojena konteksta.

**Ključna odluka**: Ne razdvajamo `useCards()` na 3 potpuno nezavisna hooka jer su tightly-coupled (bootstrap popunjava sva 4 stanja odjednom, import piše u sve, category delete kaskadira u cardMap). Umjesto toga razdvajamo **kontekste** — što daje isti re-render benefit bez rizika od race conditions.

---

## Novi konteksti (zamjena za CardDataContext)

```text
CardDataContext (stari, 12 polja)
        ↓ razdvaja se na ↓

┌─────────────────────────┐
│ CardStateContext         │  cards, dueCards, stats, cardCountByCategory, ready, dbError
│ Mijenja se: kad kartice  │
│ se dodaju/brišu/ocijene │
└─────────────────────────┘

┌─────────────────────────┐
│ CategoryStateContext     │  categoryRecords, categories, subcategories, categoryStats
│ Mijenja se: kad se doda  │
│ /obriše/reorderuje kat.  │
└─────────────────────────┘

┌─────────────────────────┐
│ ReviewStateContext       │  reviewLog, srSettings
│ Mijenja se: kad se       │
│ ocijeni sekcija ili      │
│ promijeni FSRS config    │
└─────────────────────────┘
```

`CardActionsContext` ostaje nepromijenjen (Proxy pattern, nikad se ne re-renderuje).

---

## Promjene po fajlovima

### 1. `src/contexts/AppContext.tsx` (~60 linija promjena)

**Dodati 2 nova konteksta** (interfejsi + createContext + consumer hookovi):
- `CategoryStateContext` sa `useCategoryData()` hookom
- `ReviewStateContext` sa `useReviewData()` hookom

**Smanjiti `CardDataContext`** na samo card-specifična polja:
- `cards`, `dueCards`, `stats`, `cardCountByCategory`, `ready`, `dbError`

**`CardProvider` promjene**: Umjesto jednog `data` useMemo, kreirati 3 odvojena useMemo bloka sa preciznim dependency listama:
- `cardState` zavisi od: `h.cards, h.dueCards, h.stats, h.cardCountByCategory, h.ready, h.dbError`
- `categoryState` zavisi od: `h.categoryRecords, h.categories, h.subcategories, h.categoryStats`
- `reviewState` zavisi od: `h.reviewLog, h.srSettings`

JSX: 3 nested providera umjesto 1.

**Backward-compat hookovi** (ostaju):
- `useCardData()` → sada vraća samo card state
- `useCardContext()` → merge sva 3 data konteksta + actions (za potrošače koji ne žele granularni pristup)
- `useAppContext()` → merge card + ui (nepromijenjen)

### 2. Potrošači — migracija na granularne hookove

Svaki fajl koji koristi `useCardData()` ili `useCardContext()` samo za `categoryRecords` ili `reviewLog` prebacujemo na novi hook. Ovo je **opcionalno i inkrementalno** — backward-compat hookovi rade i dalje.

**Prioritetni fajlovi** (koriste samo category podatke):
| Fajl | Trenutno | Novo |
|------|----------|------|
| `AppSidebar.tsx` | `useCardData()` za `stats, categoryRecords` | `useCardData()` za `stats` + `useCategoryData()` za `categoryRecords` |
| `Breadcrumbs.tsx` | `useCardData()` za `categoryRecords` | `useCategoryData()` |
| `ExportToCategory.tsx` | `useCardData()` za `categoryRecords` | `useCategoryData()` |
| `MnemonicModule.tsx` | `useCardContext()` za `categoryRecords` | `useCategoryData()` |
| `SettingsPage.tsx` | `useCardContext()` za `srSettings, updateSRSettings` | `useReviewData()` + `useCardActions()` |

**Fajlovi koji koriste podatke iz više konteksta** (ostaju na `useCardContext()`):
- `DashboardPage`, `LearnPage`, `ReviewPage`, `StatsPage`, `MetacognitivePage` — koriste cards + categories + reviewLog zajedno

### 3. `src/hooks/useCards.ts` — BEZ PROMJENA

Hook ostaje kao interni orkestrator. Vratio bi isti return objekat. Razlika je samo u tome kako `CardProvider` u AppContext distribuira podatke u kontekste.

---

## Scope
- 1 fajl značajno promijenjen: `AppContext.tsx` (~60 linija)
- 5 fajlova opcionalno migrirano na granularne hookove (~1-2 linije svaki)
- `useCards.ts`: 0 promjena
- Nema novih zavisnosti
- FSRS: netaknut
- Potpuno backward-kompatibilno (`useCardContext()` i `useAppContext()` rade kao prije)

