# Refaktor: `src/lib` → `src/domains/*` (3 domena)

## Cilj

Izvući tri jasno odvojena bounded contexta iz `src/lib` u `src/domains/`, sa strogim ESLint walls oko svakog. Infra (`db`, `persistence`, `migrations`, `logger`, `sr`, `editor-v4`, `motion`, `analytics/_pure`, itd.) ostaje u `src/lib`.

## Granice domena (prvi prolaz)

```text
src/domains/
├── cards/
│   ├── index.ts                ← jedini dozvoljen ulaz
│   ├── types.ts                (← lib/card-types.ts ako postoji + iz lib/spaced-repetition-types)
│   ├── repo/                   (cardMapWrites, card-fjs koje pišu u RAM/SQLite)
│   ├── queries/                (re-export tankih wrappera nad @/lib/db/queries cards*)
│   └── services/               (card import/export orkestracija ako je čisto card-bound)
│
├── planner/
│   ├── index.ts                ← preseljen iz src/lib/planner/index.ts (1:1)
│   ├── (svi postojeći planner/* fajlovi)
│   └── _legacy-shim za stari `@/lib/planner-storage`
│
└── mnemonic/
    ├── index.ts
    ├── analytics/
    │   └── weak-hooks.ts       (← lib/analytics/blind-spots.ts → calcWeakHooks; piše mnemonic IDB)
    └── re-exports iz features/mnemonic/mnemonic-storage
        (mnemonic ostaje fizički u features/mnemonic; domain barrel je façade)
```

**Šta NE diram u ovom prolazu:**
- `src/lib/db`, `src/lib/persistence`, `src/lib/migrations`, `src/lib/logger`, `src/lib/sr` (FSRS), `src/lib/editor-v4`, `src/lib/motion`, `src/lib/backlink-index`, `src/lib/repositories`, `src/lib/analytics/_pure` (čisti compute)
- `src/features/mnemonic/*` fizički ostaje gdje jeste — `src/domains/mnemonic/index.ts` je samo barrel/façade da postoji jedinstveni ulaz
- `src/store`, `src/contexts`, `src/hooks`, `src/views`, `src/components` — samo se ažuriraju import putanje

## Pristup po koracima

### 1. Cards domen (najveći ROI, najjasnija granica)
- Kreirati `src/domains/cards/index.ts` barrel
- Premjestiti: `src/lib/cards/*` → `src/domains/cards/repo/*` i `services/*`
- Re-export cards-related queries iz `@/lib/db/queries` (cards, cards-bulk-mutations) kroz domain barrel
- Zadržati shim `src/lib/cards/index.ts` koji re-exportuje iz `@/domains/cards` (1 deprecation cycle)
- Rewrite svih importa `@/lib/cards/*` → `@/domains/cards` (codemod + ručno za edge case)

### 2. Planner domen (najlakši — već je dekomponovan)
- `git mv src/lib/planner → src/domains/planner` (logički)
- `src/lib/planner-storage.ts` shim ažurirati da re-exportuje iz `@/domains/planner`
- Ažurirati importe `@/lib/planner` i `@/lib/planner/*` → `@/domains/planner`
- `loadPlannerSnapshot` & sl. ostaju u `@/lib/db/queries` (infra)

### 3. Mnemonic domen (façade only)
- `src/domains/mnemonic/index.ts` re-exportuje iz `@/features/mnemonic`
- Premjestiti `calcWeakHooks` iz `src/lib/analytics/blind-spots.ts` u `src/domains/mnemonic/analytics/weak-hooks.ts` (piše mnemonic IDB — pripada domenu)
- `calcBlindSpots` ostaje u `lib/analytics` (čist OLAP)
- Ažurirati importere `calcWeakHooks`

### 4. ESLint walls
Dodati u `eslint.config.js` `no-restricted-imports` rules (W11/W12/W13):
- **W11 cards wall**: zabraniti `@/domains/cards/*` deep import izvan `src/domains/cards/**`; dozvoliti samo `@/domains/cards`
- **W12 planner wall**: ista logika
- **W13 mnemonic wall**: ista logika
- **W14 cross-domain wall**: `src/domains/X/**` ne smije importovati `src/domains/Y/**` deep — samo kroz Y-jev barrel
- Domeni i dalje smiju importovati `@/lib/db/queries`, `@/lib/repositories`, `@/lib/logger`, `@/lib/persistence` (infra)

### 5. Verifikacija
- `tsc --noEmit` (preko harness build-a) prolazi
- ESLint clean (svi novi walls prolaze)
- `vitest run` — postojeći testovi prolaze bez izmjena (osim path update-a u par test fajlova)
- `rg "@/lib/planner-storage"` — broj ostaje stabilan (shim radi)
- Spot-check boot u preview-u: kartice se učitavaju, planner widget radi, mnemonic workshop otvara

### 6. Memory update
Dodati novi memory file `mem://architecture/domains-layout-v1` i ažurirati Core u `mem://index.md`:
> Domeni: `cards`, `planner`, `mnemonic` u `src/domains/*` sa ESLint wall-ovima (W11–W14). Infra ostaje u `src/lib`. Cross-domain importi samo kroz barrel.

## Šta dobijamo

- 3 jasne granice umjesto 203-file `src/lib` monolita
- ESLint-enforced contract — nema "slučajnog" deep importa između domena
- Otvara put za sljedeći prolaz (sources, zettel, mindmaps) bez ponovne velike chirurgije
- Memory + ARCHITECTURE.md mogu se kalibrisati nad realnom strukturom

## Rizici i mitigacije

- **Krivi import putevi nakon move-a** → koristim `rg` + ciljane sed/codemod prolaze, `tsc` kao safety net
- **Circular imports cards ↔ planner** (preko reviewLog) → ako se pojavi, ekstraktovati zajednički tip u `src/lib/db-types` (već postoji)
- **ESLint wall razbija postojeće importe** → walls dodajem TEK NAKON svih file move-ova, pa rješavam batch
- **Velika diff** → svaki domen u zasebnom prolazu (cards → planner → mnemonic), ne sve odjednom

## Trajanje (estimat)

~60–80 file move-ova + ~150–250 import line edits. Realno 1 dug session, ali isporučivo iterativno (svaki domen može da se merge-uje samostalno).
