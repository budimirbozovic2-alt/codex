

# Retrievability prioritizacija u Strateškom planeru

## Cilj
Dodati widget koji rangira kategorije po tome koliko će biti zaboravljene do dana ispita — pomoću FSRS retrievability projekcije. Već postoji `calcCategoryStability()` u `stability.ts` koja računa `avgRetrievability`, `criticalSections` i `avgStability` po kategoriji sa projekcijom do ispita.

## Promjene

### 1. `usePlannerData.ts` — dodati retrievability ranking
- Importovati `calcCategoryStability` iz `analytics/stability`
- Izračunati `categoryStability` koristeći `config.finalGoalDate`
- Sortirati po `avgRetrievability` (ascending = najugroženiji prvi)
- Eksportovati kao `retentionRisk`

### 2. `types/planner.ts` — reeksportovati tip
- Reeksportovati `CategoryStabilityInfo` za konzistentnost

### 3. `OperationsTab.tsx` — novi widget "Rizik zaboravljanja"
- Novi `motion.div` sekcija između Learning/Review Ratio i Reality Check
- Prikazuje kategorije sortirane po retrievability (najugroženija prva)
- Za svaku kategoriju: naziv, avg retrievability kao %, broj kritičnih sekcija, mini progress bar
- Colour coding: R < 70% crvena, 70-85% žuta, >85% zelena
- Prikazuje se samo ako postoje naučene sekcije (inače nema smisla)

### 4. `StrategicPlanner.tsx` — proslijediti novi prop

### 5. Lookup UUID → naziv
- Koristiti `categoryRecords` za resolving naziva (ne prikazivati UUID)

## Vizualni dizajn widgeta

```text
┌─────────────────────────────────────────┐
│ 🧠 Rizik zaboravljanja do ispita        │
│ Predmeti sortirani po ugroženosti       │
│                                         │
│ Krivično mat. pravo    ██░░░  42%  ⚠12  │
│ Upravno pravo          ████░  68%  ⚠5   │
│ Građansko proc. pravo  █████  89%       │
│ ...                                     │
└─────────────────────────────────────────┘
```

## Scope
- 4 fajla, ~50 linija neto
- Nema novih zavisnosti — koristi postojeći `calcCategoryStability`
- Nema promjene ponašanja postojećih mehanizama

