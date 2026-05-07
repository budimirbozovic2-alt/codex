## Cilj

Razbiti `src/components/ExportImportDialog.tsx` (552 LOC, "God Object" iz Health Reporta — ocjena C+) na fokusirane komponente korake i jedan custom hook za validaciju. Ponašanje, propsi i UX ostaju identični — radi se isključivo o **presentation/structural refactoru**.

## Ciljna struktura fajlova

```text
src/components/ExportImportDialog.tsx          (orchestrator, ~120 LOC)
src/components/export-import/
  ├─ types.ts                                  (Step, ImportValidation)
  ├─ MenuStep.tsx                              (početni izbor: Export / Import)
  ├─ ExportStep.tsx                            (Template / Full + ZIP toggle)
  ├─ ProgressStep.tsx                          (zajednički za "exporting", "import-validating", "importing")
  ├─ ImportConfirmStep.tsx                     (summary + schema-version row + greške)
  ├─ ImportConflictStep.tsx                    (3 strategije: newer / keep / overwrite)
  └─ useImportValidation.ts                    (hook: parseJsonInWorker → migrateRaw → Zod-lite checks → FK guard)
```

## Podjela odgovornosti

**`ExportImportDialog.tsx` (orchestrator)**
- Drži `step`, `validation`, `progress`, `progressMsg`, `compress` state.
- Bira koju step-komponentu da renderuje (switch po `step`).
- Drži `handleExportTemplate`, `handleExportFull`, `handleImport(strategy)` jer oni žive uz `onExportTemplate/onExportFull/onImport` propse.
- Delegira validaciju na `useImportValidation` hook.
- Zadržava postojeće propse (`open`, `onOpenChange`, `onExportTemplate`, `onExportFull`, `onImport`, `cards`) — bez breaking change-a za pozivaoce.

**`useImportValidation.ts`**
- Eksportuje funkciju `validateImportFile(file, onProgress): Promise<ImportValidation>`.
- Sadrži cijelu trenutnu logiku iz `handleFileSelect` (linije 76–284): off-thread parse, `migrateRaw`, UUID/sections checks sa `yieldUI()` na 1000/2000, FK guard, duplikat detekcija.
- Bez React state-a — vraća čisti `ImportValidation` objekat. Orchestrator odlučuje sljedeći step.

**`MenuStep.tsx`**
- Dva button-a (Export / Import) + skriveni `<input type="file">`.
- Logika za Electron `showOpenDialog` ostaje ovdje (koristi `window.electronAPI`), props: `onPickExport()`, `onFileSelected(file: File)`.

**`ExportStep.tsx`**
- ZIP Switch + dva exporta. Props: `cardsCount`, `compress`, `onCompressChange`, `onExportTemplate`, `onExportFull`, `onBack`.

**`ProgressStep.tsx`**
- Loader + `<Progress>` + `progressMsg`. Props: `progress`, `message`. Reuse-ovan za 3 različita progress-state-a (eliminiše duplikat na linijama 389–411).

**`ImportConfirmStep.tsx`**
- Summary grid (kartice/kategorije/tip/veličina), schema-version red (`willMigrate` / `fileVersion` / fallback), warning za >500 kartica, error lista ako `!validation.valid`.
- Props: `validation`, `currentCardsCount`, `onConfirm()`, `onCancel()`.

**`ImportConflictStep.tsx`**
- 3 strategije: `newer` / `keep` / `overwrite`. Props: `validation`, `onChoose(strategy)`, `onCancel`.

**`types.ts`**
- `Step` union i `ImportValidation` interface (trenutno inline u dialogu).

## Šta se NE mijenja

- Public API komponente (`ExportImportDialogProps`).
- Sve interakcije, stringovi, ikone, klase, `DialogContent` `sm:max-w-*` širine po koraku.
- Logika validacije, redoslijed yield-ova, progres procenti, threshold-ovi (1000/2000, >500), error poruke.
- `onImport` / `onExportTemplate` / `onExportFull` ugovori i toast ponašanje (dialog se zatvara u `finally`, kao i sad).

## Verifikacija

- `bunx vitest run src/test/backup-schema.test.ts` (postojeći testovi ostaju zeleni).
- TypeScript build prolazi (harness automatski).
- Smoke check kroz preview: Menu → Export (Template & Full s/bez ZIP) → Import (validan JSON, validan ZIP, nevažeći fajl, fajl s duplikatima → conflict step).

## Procjena

~7 novih malih fajlova, dialog spada sa 552 → ~120 LOC. Ciljna ocjena modula: **C+ → A-**.