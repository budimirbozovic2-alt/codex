# Plan: Selektivni import (kartice + taksonomija) iz v7 backupa

## Stanje

Backup `codex-backup-2026-05-06.json` (22 MB):
- `version: 7` (poklapa se sa `BACKUP_SCHEMA_VERSION = 7` u aplikaciji)
- `categories: 9` (puna UUID struktura sa `subcategories[].chapters[]`)
- `cards: 811` (esej + flash, `sections[].content` u HTML formatu, UUID `categoryId/subcategoryId/chapterId`)
- + 30+ log/sat satelitskih tabela (sources 32, mindMaps 3, KB 17, mnemonics, majorSystem, reviewLog, activityLog, slippageLog, itd.)

Tebe zanima samo prvo dvoje. Postojeći import (`useCardImport.importData` → `applyImportAtomically`) je sve‑ili‑ništa: u jednoj SQLite ACID transakciji upisuje **i** kartice, **i** kategorije, **i** sources, **i** mindMaps, **i** KB, **i** sve logove. To je razlog zašto se "ne može" — ili padne na nekoj satelitskoj tabeli, ili bi prepisao tvoju refaktorisanu bazu sa starim sources/KB/mindMaps/mnemonics koje ne želiš.

## Cilj

Dodati **Selektivni Restore** mod koji:
1. Učita ZIP/JSON iz v7 backupa.
2. Validira **samo** `categories` + `cards` (sve ostalo ignoriše).
3. Pre‑Zod presiječe payload na ta dva polja (sa praznim defaultima za sve ostalo) tako da `applyImportAtomically` upiše samo te dvije domene unutar iste SQLite ACID transakcije.
4. Pita za strategiju spajanja **samo za kartice**: `skip` (default — preskoči postojeće `id`), `keep` (zadrži postojeće), `overwrite` (zameni), `newer` (po `updatedAt`).
5. Za **taksonomiju**: `merge by id` — postojeće kategorije/podkategorije/glave ostaju, nove iz backupa se dodaju; konflikt po `id` rešava se izborom (zadrži trenutne / prepiši iz backupa).

## Implementacija

Tri male izmene, bez ijednog novog provajdera ili tabele.

### 1. `src/lib/backup/import-slice.ts` (novo)

Čista funkcija (no side effects):

```ts
export type ImportSlice = "cards-and-taxonomy" | "full";

export function sliceParsedBackup(parsed: ParsedBackup, slice: ImportSlice): ParsedBackup
```

Za `cards-and-taxonomy` vraća kopiju gdje su sva polja osim `categories`, `cards`, `version`, `type` postavljena na prazan niz / `undefined`:
`sources: [], mindMaps: [], diary: [], calibrationLog: [], latencyLog: [], slippageLog: [], activityLog: [], disciplineLog: [], pomodoroLog: [], mnemonics: [], majorSystem: [], mnemonicTestLog: [], knowledgeBaseArticles: [], settings: [], reviewLog: [], srSettings: undefined, localStorageData: undefined`.

Time `write-satellite-tx.ts` i `write-sources/write-mindmaps` putevi unutar `applyImportAtomically` postaju no‑op jer svi `if (parsed.X.length > 0)` filtriraju prazne nizove (provjeriti i po potrebi dodati ranne `if` u `writeSatelliteTablesTx` ako neka grana ne pazi na duljinu).

### 2. `src/hooks/useCardImport.ts` — dodati drugi entry point

```ts
const importCardsAndTaxonomy = useCallback(
  async (file: File, strategy: ImportStrategy = "skip", onProgress?: ImportProgress) => {
    // identičan pipeline kao importData, ali nakon migrateBackup + Zod parse:
    const parsed = sliceParsedBackup(fullParsed, "cards-and-taxonomy");
    await applyImportAtomically({ parsed, strategy, currentMap: getCardMap(), onProgress });
  }, [...],
);
return { importData, importCards, importCardsAndTaxonomy };
```

Nakon transakcije zovemo:
- `categoryRepository.replaceAll(finalCategories)` (već radi u `applyImportAtomically`)
- `cardMapBulkPut(merged)` (već radi)
- preskačemo `replaceReviewLog`, `updateSRSettings`, `invalidateSourcesCache` (nije relevantno za ovaj slice)

### 3. UI: `src/components/ExportImportDialog.tsx`

Na "Import" koraku dodati radio:
- **( ) Puni restore** — postojeće ponašanje
- **(•) Samo kartice + taksonomija** — poziva `importCardsAndTaxonomy`

Plus jasan tekst ispod: "Postojeći Sources, Mind Maps, Knowledge Base, Mnemonics, logovi i podešavanja se ne menjaju."

Strategija konflikta (skip/overwrite/newer/keep) ostaje isti dropdown.

### 4. Edge cases za HTML sadržaj sekcija (već pokriveno)

Backup ima `sections[].content` kao HTML (npr. `<p><strong>Ustav...</strong></p>`). `BackupSectionSchema.content = SafeHtml` → prolazi kroz DOMPurify. Editor v4 lazy‑migracija (`migrateCard` u `src/lib/editor-v4/migrate.ts`) na prvo otvaranje kartice konvertuje HTML → `contentDoc` (ProseMirror JSON), test fixture to potvrđuje. Znači **formatiranje (bold, paragrafi, mark/key‑part, wiki‑linkovi, mindmap embeds) ostaje očuvano** — ništa dodatno nije potrebno.

### 5. Taksonomija remap

`applyImportAtomically` već zove `buildCategoryIdRemap` + `applyRemapToParsed` koji po imenu kategorije remapuje stare UUID na postojeće u tvojoj refaktorisanoj bazi (ako se zovu isto). To je tačno ponašanje koje želimo: ako "Ustavno pravo i organizacija pravosuđa" već postoji sa drugim UUID‑om u novoj bazi, kartice iz backupa će biti preusmerene na novi UUID umjesto da kreiraju duplikat kategoriju. Za podkategorije/glave koje **ne postoje**, biće dodate u novu strukturu.

### 6. Verifikacija

- Vitest: dodati `src/test/import-slice.test.ts` koji puni `BackupSchema.parse` sa fixture sličnim ovom backupu i provjerava da nakon `sliceParsedBackup(..., "cards-and-taxonomy")`:
  - `sources/mindMaps/KB/mnemonics/log` polja su prazna
  - `cards/categories` netaknuta
- Manuelno: importuj `codex-backup-2026-05-06-2.zip` u published build, otvori 3‑4 nasumične kartice, potvrdi `sections[].content` se renderuje sa formatiranjem.

## Šta NE diramo

- Postojeća `applyImportAtomically` transakcija — ona je već ispravna; samo joj prosljeđujemo "isečen" payload.
- `migrateRaw` / `migrateBackup` ladder — backup je v7, prolazi kroz njih kao no‑op.
- `editor-v4` migracija — već postoji i pokriva HTML → contentDoc na lazy load.
- Sources / KB / Mind Maps / Mnemonics — ostaju **nedirnuti** u tvojoj refaktorisanoj bazi.

## Out of scope (eksplicitno)

- Ne uvozimo: reviewLog, srSettings, sve log tabele, sources, mindMaps, knowledgeBaseArticles, mnemonics, majorSystem, settings, localStorageData.
- Ne radimo "merge" sources iz backupa sa novim sources — koristiš čistu, refaktorisanu bazu sources.
- Ne implementiramo undo (postojeća ACID transakcija je atomarna; rollback samo na grešku tokom transakcije).

## Procjena

3 male izmene + 1 test, 1 PR. ~150 linija koda. Rizik: niski (postojeća transakcija već radi sa praznim satelitskim poljima u `writeSatelliteTablesTx`; potrebno samo provjeriti da svaka grana ima early‑return na `length === 0`).
