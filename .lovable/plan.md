

# Razdvajanje db.ts na tri modula

## Rezime

`db.ts` (432 linije) sadrži tri logički odvojene cjeline: šemu/inicijalizaciju, upite, i seed podatke. Razdvajamo ih u fokusirane module, a originalni `db.ts` postaje barrel re-export — **48 potrošača ne mijenjaju nijedan import**.

## Novi moduli

| Modul | Sadržaj | ~Linije |
|-------|---------|---------|
| `src/lib/db-schema.ts` | Tipovi (ChapterNode, SubcategoryNode, CategoryRecord, Source, MindMap*), MemoriaDB klasa, `db` instanca, event handleri, reload guard, `ensureDbOpen`, `dbErrorState`/`getDbErrorState` | ~200 |
| `src/lib/db-queries.ts` | Sve `idb*` funkcije (cards, categories, reviewLog, settings, aggregation) | ~120 |
| `src/lib/db-seed.ts` | `DEFAULT_CATEGORIES`, `createDefaultCategories`, `seedDefaultCategories`, `migrateFromLocalStorage` | ~50 |
| `src/lib/db.ts` | Barrel: re-exportuje sve iz gornja tri modula | ~5 |

## Zavisnosti između modula

```text
db-schema.ts  ←── db-queries.ts (importuje `db` instancu)
     ↑
db-seed.ts (importuje `db`, `CategoryRecord`, `createDefaultCategories`)
     ↑
db.ts (barrel — re-exportuje sve)
```

## Detalji implementacije

### `db-schema.ts`
- Svi tipovi/interfejsi (L9-99)
- `dbErrorState`, `getDbErrorState` (L10-11)
- `MemoriaDB` klasa i `db` singleton (L126-184)
- Event handleri: `blocked`, `versionchange` (L186-198)
- Reload guard: `reloadScheduled`, `unblockIntervalId`, interval (L200-217)
- `ensureDbOpen()` (L223-291)

### `db-queries.ts`
- `import { db } from "./db-schema"`
- Sve funkcije L321-432: `idbLoadCards`, `idbPutCard`, `idbBulkPutCards`, `idbDeleteCard`, `idbLoadCategories`, `idbSaveCategory`, `idbSaveCategories`, `idbDeleteCategory`, `idbLoadReviewLog`, `idbLoadRecentReviewLog`, `idbCountReviewLog`, `idbAddReviewLogEntry`, `idbLoadSettings`, `idbSaveSettings`, `idbCountCardsByCategory`, `idbCountAllCards`, `idbCountByType`, `idbCountReviewLogSince`

### `db-seed.ts`
- `import { db, type CategoryRecord } from "./db-schema"`
- `DEFAULT_CATEGORIES` (L103-113)
- `createDefaultCategories()` (L115-123)
- `seedDefaultCategories()` (L296-305)
- `migrateFromLocalStorage()` (L308-317)

### `db.ts` (barrel)
```ts
export * from "./db-schema";
export * from "./db-queries";
export * from "./db-seed";
```

## Scope
- 3 nova fajla, 1 fajl pretvoren u barrel
- 0 promjena u 48 potrošača
- Nema novih zavisnosti
- FSRS: netaknut

