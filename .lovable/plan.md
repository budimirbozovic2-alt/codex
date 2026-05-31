## PR-E3 — Status nakon revizije

Tokom istraživanja sam prošao SVE pisače koje PR-E3 navodi (Import, Heal, Migracije) i utvrdio da je **substantivni dio migracije već urađen** kroz PR-E2/E4. Svi pisači koriste `*Direct` API + `notifyCardsChanged` / `announceCardsReplaced`. Nema više nijedne **žive** referencu na `cardMapWrites.*` funkcije.

### Šta je već migrirano (verified)

| Mjesto | Pisač | Status |
|---|---|---|
| `src/hooks/useCardImport.ts` | `importData` → `applyImportAtomically` (SqlExecutor.transaction) + `announceCardsReplaced(nextMap)` | ✅ Direct + bridge invalidate |
| `src/hooks/useCardImport.ts` | `importCards` (bulk Q&A import) | ✅ `bulkPutCardsDirect` |
| `src/lib/backup/import-transaction.ts` | Atomic restore — `writeCardsTx` unutar `SqlExecutor.transaction` | ✅ Tx + post-tx `announceCardsReplaced` u pozivaocu |
| `src/lib/migrations/heal-card-taxonomy.ts` | One-shot heal (stale sub/chapter UUID-i) | ✅ `bulkPutCardsDirect` |
| `src/lib/migrations/remap-from-backup.ts` | Remap nakon legacy backupa | ✅ `bulkPutCardsDirect` |
| `src/lib/services/healthService.ts` | Health repair (`healHierarchy`) | ✅ `bulkPutCardsDirect` |
| `src/domains/cards/index.ts` | Public barrel | ✅ prazan (legacy `cardMapWrites` modul obrisan) |

### Šta je ostalo (sve stari komentari)

`rg "cardMapWrites\." src` vraća **0 call-sites** i samo **3 stale doc-comment reference** koje upućuju na ime modula koji više ne postoji:

1. `src/lib/db/queries/cards-writes.ts:69` — `// the former cardMapWrites.clearLinks semantics`
2. `src/lib/migrations/heal-card-taxonomy.ts:31` — `// writes via cardMapWrites.bulkPut`
3. `src/lib/services/healthService.ts:189` — `// then commit through cardMapWrites.bulkPut`

Dodatno, `heal-card-taxonomy.ts` ima zastario PR-marker (`PR-9 A1c-3` umjesto `PR-E3`).

---

## Plan: čisto kozmetičko zatvaranje PR-E3

### 1. Osvježiti 3 stale komentara

- `cards-writes.ts:67-71` — `cardMapWrites.clearLinks` → `legacy clearLinks RAM-commit` (sa napomenom da je modul obrisan u PR-E2).
- `heal-card-taxonomy.ts:24-32` — preformulisati JSDoc: pisanje ide kroz `bulkPutCardsDirect` (SqlExecutor.transaction → `notifyCardsChanged`). Update PR-marker na **PR-E3**.
- `healthService.ts:185-201` — analogna preformulacija inline komentara.

### 2. Regression guard (ESLint `no-restricted-syntax`)

U `eslint.config.js` dodati pravilo koje banuje identifikator `cardMapWrites` u source kodu (sa allow-listom za `*.md`/komentare ako bude trebalo). Pošto modul više ne postoji, svaki novi `cardMapWrites.*` poziv bi i tako pukao u TS-u — ali eksplicitno ESLint pravilo služi kao **stalni semantički wall** koji čuva PR-E invariantu, slično kao W7 (Dexie) i W10 (motion) već imamo.

Predlog:
```js
{
  selector: "MemberExpression[object.name='cardMapWrites']",
  message: "cardMapWrites is deleted (PR-E). Use *Direct helpers from @/lib/db/queries.",
}
```

### 3. Memory update

Osvježiti `mem://architecture/cards-tanstack-ssot` jednom rečenicom: "PR-E3 verified — Import/Heal/Migrations all on `*Direct` + `announceCardsReplaced`; zero `cardMapWrites` call-sites remain."

### 4. Verifikacija

- `bun run lint` (novo pravilo zelen­o, ostalo netaknuto).
- `bunx tsc -p tsconfig.app.json --noEmit`.
- `bun test` — postojeći `import-transaction-split` i `cards-mirror-and-rollback` testovi pokrivaju ovaj put.

### Tehnički detalji

Nijedna runtime promjena. Sve 4 stavke su komentari + lint-konfiguracija + memo. Nema migration SQL-a, nema novih API endpointa, nema novih file-ova osim možda jednog mem fajla.

### Šta NIJE u skopu (otvorena pitanja za PR-E4 ili posebne PR-ove)

- `categoryRepository.replaceAll(...)` u `import-transaction.ts:176` se zove _unutar_ `applyImportAtomically`, a `useCardImport.ts:142` zove istu metodu **drugi put** post-tx. To je suvišno (double-replace), ali nije PR-E3 scope — ako želiš, otvorim PR-E3a.
- Provjera da li `applyImportAtomically` izvršava `notifyCardsChanged` _unutar_ svog `try` bloka (trenutno se to oslanja na pozivaoca `announceCardsReplaced`). Ako neki drugi pozivalac u budućnosti zaboravi pozvati `announceCardsReplaced`, cache će ostati ustajao. Mogli bismo prebaciti notifikaciju u sam `applyImportAtomically` (post-commit). Reci ako želiš da uđe u PR-E3.

Reci `Implement plan` ako prihvataš ovaj minimalni cleanup, ili mi reci da li želiš da se PR-E3 proširi sa stavkom o `applyImportAtomically` self-notify (preporučujem — to je realna runtime tvrdoća, ne kozmetika).