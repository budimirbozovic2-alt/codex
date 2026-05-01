## Pregled stanja Export / Import sistema

Pregledao sam `useCardExport.ts`, `useCardImport.ts`, `backup-schema.ts` i `db-schema.ts` (Dexie v16). Sistem je u dobrom stanju, ali postoji **6 konkretnih rupa** zbog kojih backup nije u potpunosti reverzibilan.

### Šta trenutno RADI ispravno
- Sve glavne IDB tabele su pokrivene: `cards`, `categories`, `sources`, `mindMaps`, `reviewLog`, `pomodoroLog`, `diary`, `calibrationLog`, `latencyLog`, `slippageLog`, `activityLog`, `disciplineLog`, `mnemonics`, `majorSystem`, `mnemonicTestLog`, `knowledgeBaseArticles`.
- Zod sanitizacija (DOMPurify) na svim HTML poljima.
- Atomska `overwrite` strategija za cards+categories u jednoj transakciji.
- Remap kategorija po imenu (deduplikacija UUID-ova) prije persist-a.
- Legacy taxonomy resolver (string imena → UUID).
- ZIP kompresija + Electron native save dialog.

### Identifikovane rupe (potrebno popraviti)

**1. Neusklađen localStorage allowlist (kritično)**
- Export upisuje 6 ključeva: `sr-app-settings`, `sr-mnemonic-workshop`, `sr-mnemonic-associations`, `sr-major-system-map`, `sr-learn-progress`, `sr-last-backup`.
- Import allowlist (`ALLOWED_LS_KEYS`) prihvata druge ključeve: `codex-app-settings`, `codex-source-registry`, `codex-monument-types`, `sr-planner`, `sr-mnemonic-system`, `sr-pomodoro-settings`.
- **Rezultat**: gotovo nijedna eksportovana lokalna postavka se ne uvozi nazad. App settings, planner config (`sr-planner-config`), daily mapped count itd. se "izgube".

**2. `db.settings` tabela se ne eksportuje u potpunosti**
- Export ručno čita samo 3 ključa (`plannerConfig`, `dailyMapped`, `dailyMappedDate`).
- Tabela sadrži još: `srSettings`, `appSettings`, `lastAnalysisDate`, `appEntry`, `lastRedistribute`, te sve `sr-app-subject-settings:<categoryId>` po-predmetu (vidjeti `subject-settings.ts`).
- **Rezultat**: per-subject postavke (font, dnevna rutina po predmetu) nisu u backup-u.

**3. `pomodoroLog` se eksportuje ali NIJE u import petlji**
- U `useCardImport.ts` `idbTables` listi nema `pomodoroLog` — postoji samo u export-u.
- **Rezultat**: pomodoro istorija nestane nakon restore-a.

**4. Zettelkasten `tags` i `isIndex` polja nisu u Zod schemi**
- `BackupKnowledgeBaseArticleSchema` ne lista `tags` i `isIndex` u `.object({...})`. Doduše `.passthrough()` ih propušta, ali nisu sanitizovani niti garantovani u tipu.
- **Rezultat**: radi slučajno; treba ih eksplicitno deklarisati radi sigurnosti i otpornosti na buduće promjene.

**5. Subject-level settings (`sr-app-subject-settings:<uuid>`) nisu u backup-u**
- Žive u `db.settings` pod prefiksom `sr-app-subject-settings:`. Niti export niti import ih dotiče.

**6. Sitne neusklađenosti**
- `srSettings` se uvozi samo u `overwrite` modu, ali se uvijek eksportuje — OK po dizajnu, samo zabilježiti.
- `reviewLog` se isto uvozi samo u `overwrite` — to je namjerno (izbjegava duple zapise), OK.

---

## Plan ispravki

### Korak 1 — Uskladiti localStorage allowlist (`useCardImport.ts`)
Proširiti `ALLOWED_LS_KEYS` da pokrije **stvarne** ključeve koje export upisuje, plus aktivno korišćene u kodu:
```
sr-app-settings, sr-mnemonic-workshop, sr-mnemonic-associations,
sr-major-system-map, sr-learn-progress, sr-last-backup,
sr-planner-config, sr-daily-mapped-count, sr-daily-mapped-date,
sr-dark-mode, sr-tts-settings
```
Ukloniti mrtve ključeve (`codex-*`, `sr-pomodoro-settings`) jer ih niko ne koristi.

### Korak 2 — Eksportovati cijelu `db.settings` tabelu
U `useCardExport.ts`:
- Dodati `db.settings.toArray()` u `Promise.all`.
- Upisati kao `settings: [...]` na top-level backup payload-a (uključuje `appSettings`, `srSettings`, `plannerConfig`, `dailyMapped*`, `lastAnalysisDate`, `appEntry`, sve `sr-app-subject-settings:*`).
- Ukloniti ručno čitanje 3 ključa (postaje suvišno).

### Korak 3 — Uvoz `settings` tabele
U `useCardImport.ts`:
- Dodati `settings` u `uuidTables` listu (key path je `key`, string).
- Sanitizovati string `value` polja kroz `sanitizeLSValue` analogno LS putanji.
- U `overwrite` modu: clear + bulkPut. Inače: bulkPut (override po ključu).

### Korak 4 — Schema u `backup-schema.ts`
- Dodati `BackupSettingsEntrySchema = z.object({ key: z.string(), value: z.unknown() }).passthrough()`.
- Dodati `settings: z.array(BackupSettingsEntrySchema).default([])` na `BackupSchema`.

### Korak 5 — Dodati `pomodoroLog` u import petlju
U `useCardImport.ts` dodati `{ key: "pomodoroLog", table: "pomodoroLog" }` u `autoIncTables`.

### Korak 6 — Eksplicitno deklarisati Zettelkasten polja
U `BackupKnowledgeBaseArticleSchema` dodati:
- `tags: StringArray` (već postoji helper)
- `isIndex: z.unknown().optional().transform(v => v === true)`
Update transform-a da ih prosljeđuje na `KnowledgeBaseArticle`.

### Korak 7 — Bump backup version
Podići `version: 6` → `version: 7` u `exportData` payload-u (čisto označavanje formata; schema ostaje backward-compatible jer su sva nova polja `.default([])` / `.optional()`).

### Korak 8 — Mali UX dodatak
U `extraParts` summary toast (`useCardImport.ts` linija ~376) dodati prikaz broja restored `settings` zapisa.

---

## Tehnički detalji (za QA)

**Files to modify:**
- `src/hooks/useCardExport.ts` — dodati settings export, ukloniti ručno čitanje 3 ključa, bump version
- `src/hooks/useCardImport.ts` — proširiti allowlist, dodati settings + pomodoroLog u petlje, dodati toast summary
- `src/lib/migrations/backup-schema.ts` — dodati `BackupSettingsEntrySchema`, dopuniti `BackupKnowledgeBaseArticleSchema`, dodati `settings` na top-level

**Backward kompatibilnost:** Stari backup-ovi (v3-v6) ostaju ispravni — sva nova polja imaju `.default([])`. Schema i dalje prihvata legacy `categories: string[]`.

**Test pokrivenost:** Postojeći testovi u `src/test/backup-schema.test.ts` ostaju zeleni; preporučuje se dodati 2 nova: (1) settings round-trip, (2) pomodoroLog round-trip.

**Procjena obima:** ~80 linija izmjena u 3 fajla, nisu rizične.
