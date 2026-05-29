# Analiza `codex-backup-2026-05-06.json` (v7, 21.8 MB)

## Sažetak sadržaja

| Tabela | Količina |
|---|---|
| categories | 9 (full UUID shape, sa subcategories/chapters) |
| cards | 811 (1.573 sekcija) |
| sources | 32 |
| mindMaps | 3 |
| knowledgeBaseArticles | 17 |
| mnemonics | 2 |
| majorSystem | 101 pegova |
| reviewLog / activityLog / disciplineLog / slippageLog | 20 / 472 / 30 / 35 |
| diary / latencyLog / pomodoroLog / mnemonicTestLog | 1 / 3 / 1 / 1 |
| settings | 10 (uključuje `appSettings`, `examProfile` itd.) |
| localStorageData | prisutno (sr-app-settings, dark-mode, tts...) |

`version: 7` poklapa se sa `BACKUP_SCHEMA_VERSION = 7`, pa migracijska skala (`migrateRaw` + `migrateBackup`) ne radi ništa — backup ide direktno u Zod.

## Ocjena: 95% spreman za uvoz, ali postoji JEDAN blokator

### Blokator — strict schema na `BackupMnemonicSchema`

Provjerom svih ključeva, **mnemonici nose 2 legacy polja** koja schema ne dozvoljava:

```
mnemonic extras: {'subcategory', 'category'}
```

`src/lib/migrations/backup-schema.ts:329` koristi `.strict()`, a top-level `BackupSchema` zove `z.array(BackupMnemonicSchema).default([])` (nije `lenientArray`). Posljedica: čim Zod naiđe na ova polja → cijeli `BackupSchema.safeParse` puca → `useCardImport` baca `BackupValidationError` → uvoz se zaustavlja prije nego se išta upiše.

Sve ostale entitetske kolekcije su čiste:
- `card extras: set()` ✅
- `source extras: set()` ✅
- `kb extras: set()` ✅
- `category extras: set()` ✅

### Šta još radi bez problema

- **Cards**: schema već prima legacy `subcategory`/`chapter` aliase i tip `flash|essay`. Sva 811 kartica ima validne UUID-ove i sekcije sa `id`-em (0 bad).
- **Categories**: već u novom UUID obliku (id + subcategories[].chapters[]) → `BackupCategoryRecordSchema` ih parsuje direktno, `buildCategoryIdRemap` će ih spojiti sa postojećih 9 oficijelnih po imenu (pa će zadržati postojeće UUID-ove i remapirati cards/sources/KB).
- **Sources**: imaju `sourceKind`, `slMarkings`, `isExclusive` — sve dozvoljeno. `contentDoc` se sintetiše prazan AST i lazy-migrira na prvo otvaranje (PR-7b).
- **KB articles**: 17 članaka, uključuje `isIndex` i `tags` — schema-OK.
- **Satellite logovi** (review/activity/discipline/slippage/diary/latency/pomodoro/mnemonicTestLog/majorSystem): koriste `lenientArray` — jedan loš red ne ruši uvoz.
- **Top-level `subcategories` (legacy name-keyed)** i **`localStorageData`**: BackupSchema ima `.passthrough()` na rootu, pa ih Zod tiho prihvata i ignoriše (`localStorageData` nikad ne stiže do SQLite-a, što je OK — preferencije već idu kroz `settings` tabelu).
- **`srSettings`** sa `resistanceWeights` → parsuje se i primjenjuje kad je strategija `overwrite`.

### Sekundarna zapažanja (nisu blokatori)

1. **`localStorageData` se baca** — ako korisnik očekuje da mu se vrati `sr-dark-mode`, `sr-tts-settings`, `sr-learn-progress`, neće. Ovo postoji u backupu ali nigdje u SQLite cutoveru. Možemo dodati most kasnije.
2. **`top-level subcategories` (string nazivi)** — historijski format koji ostaje u backupu i kod novih exporta? Worth provjeriti zašto se exportuje ako je već unutar `categories[].subcategories[]`. Trošak: ~3 KB. Niskog prioriteta.
3. **`mnemonic.category` / `mnemonic.subcategory` (string)** — moraju se ili dodati u schemu kao opcioni-i-ignorisani, ili `category` mora postati legacy alias za `categoryId` (slično kao `subcategory` → `subcategoryId` kod kartica).

## Predloženi fix (minimalan, 1 fajl)

**`src/lib/migrations/backup-schema.ts` — `BackupMnemonicSchema`:**

Dodati legacy opciona polja prije `.strict()` i mapirati ih u `categoryId`/`subcategoryId` u `.transform()` (isti pattern kao već postoji za `BackupCardSchema`):

```ts
// dodati u .object({ ... }) prije .strict():
category: z.unknown().optional(),         // legacy alias za categoryId (name ili UUID)
subcategory: z.unknown().optional(),      // legacy alias za subcategoryId

// u .transform((m): MnemonicCard => { ... }):
const catId =
  typeof m.categoryId === "string" && m.categoryId ? m.categoryId :
  typeof m.category === "string" ? m.category : "";
const subId =
  typeof m.subcategoryId === "string" ? m.subcategoryId :
  typeof m.subcategory === "string" ? m.subcategory : undefined;
// ... pa koristiti catId/subId u `out`.
```

Ako legacy vrijednost dođe kao *naziv* (a ne UUID), `resolveLegacyTaxonomyNames` u `applyImportAtomically` ionako mapira na UUID koristeći postojeće kategorije.

### Bonus tvrdoglavost (opcionalno, ali jeftino)

Zamijeniti `z.array(BackupMnemonicSchema).default([])` sa `lenientArray(BackupMnemonicSchema, "mnemonics")` na liniji ~609. Time se otklanja klasa grešaka gdje jedna pokvarena mnemonika u budućnosti ne ruši cio restore. Isti pattern bi imao smisla i za `cards`, `sources`, `mindMaps`, `knowledgeBaseArticles`, ali to je veća promjena i mijenja safety profile (tihi data-loss) — preporuka: ostaviti striktno za primary entities, lenient samo za mnemonics + logove.

## Plan implementacije (1 koraka)

1. Editovati `src/lib/migrations/backup-schema.ts`:
   - U `BackupMnemonicSchema.object` dodati `category` i `subcategory` kao `z.unknown().optional()`.
   - U `.transform()` resolvati alias u `categoryId`/`subcategoryId`.
   - (Opcionalno) prebaciti `mnemonics` na `lenientArray` u `BackupSchema`.

## Verifikacija

- `bunx vitest run src/test/backup-schema.test.ts` — postojeći testovi moraju ostati zeleni.
- Dodati jedan test fixture sa mnemonikom koja ima `category: "Krivično materijalno pravo"` i očekivati uspješan parse + resolvani `categoryId`.
- Ručno: u desktop buildu povući `codex-backup-2026-05-06.json` u ExportImportDialog → očekivati `import-confirm` step (uvoz 9/811/32/17), bez `BackupValidationError`.

## Odgovor na pitanje "da li ćemo moći da importujemo?"

**Trenutno: NE** — strict schema na mnemonicima blokira parse. **Nakon predloženog 1-fajl fixa: DA**, sve relevantne tabele prolaze, kategorije će se mergeovati po imenu (zadržaće se postojeći 9 UUID-ova ako su isti, inače remap kroz `buildCategoryIdRemap`), kartice/sources/KB će biti remapirani na finalne kategorije UUID-ove, satellite logovi idu kroz `lenientArray` pa su sigurni. `localStorageData` se gubi (nije kritično — `appSettings` se ipak nalazi i u `settings[]`).
