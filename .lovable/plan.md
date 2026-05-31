## PR-G1 — Status & Plan

### Već shipped (ne diramo)
- **M1 (C-1)** Mnemonic upsert merge u `useMnemonicMutations.saveCards.onMutate` — sa "PR-G1 / C-1" markerom (lines 49-101).
- **M3 (H-4)** Quit-backup timeout — već 30s (NE 15s kako spec kaže; odluka: zadržati 30s zbog datasetova >5k cards), toast.error + logger.error već postoje (lines 164-199).
- **M4 (M-1)** `persist-queue.cleanup` clear-na-ulazu **i** clear-na-izlazu rescue timera, sa "PR-G1 / M-1" markerom (lines 229-252).
- **M4 (M-2)** `reviewLogRepository.flush` clear debounce timera prvo, sa "PR-G1 / M-2" markerom (line 77).

### Stvarni rad u ovom prolazu: M2 (C-2) — throw propagation

Trenutno `saveAppSettings` / `saveSubjectSettings`:
- Imaju **`void` return**, lokalni `.catch(logger.error)` koji **NE baca** dalje.
- 3 call-sitea (`SRSettingsPanel.handleSave` x2, `PersonalizationTab` sound toggle x1) zovu fire-and-forget bez ikakvog awaitanja, pa korisnik dobija `toast.success` čak i ako SSOT write padne.

#### Promjene

**1. `src/lib/app-settings.ts:98`** — `saveAppSettings`
- Signature: `(settings: AppSettings): void` → `(settings: AppSettings): Promise<void>`
- Implementacija: `await putSetting("appSettings", settings)` (bez `.catch`); localStorage mirror prije await-a (idempotentno, brzo).
- Ako `putSetting` reject-uje: `console.error` (preko `logger.error`) **+ re-throw** da caller surfacira.

**2. `src/lib/subject-settings.ts:88`** — `saveSubjectSettings`
- Identičan tretman: `Promise<void>`, await + log + throw.
- `clearSubjectSettings` (line 101) ostaje void/log-only (delete tolerantan na fail).

**3. Call-site updates** (3 fajla):

`src/components/SRSettingsPanel.tsx:110-136` — `handleSave`
- Pretvoriti u `async`, await `saveSubjectSettings` i `saveAppSettings`, wrap u try/catch.
- Na catch: `toast.error("Postavke nisu sačuvane u bazu. Pokušaj ponovo.")` umjesto pogrešnog `toast.success`.
- Save success path nepromijenjen.

`src/components/settings/PersonalizationTab.tsx:80-88` — sound toggle `onCheckedChange`
- Pretvoriti u async handler; await + try/catch + `toast.error` na fail (i revertovati `setApp` da UI ne ostane u stanju koje nije perzistirano).

#### Verifikacija
- `rg "saveAppSettings\(|saveSubjectSettings\(" src` → svi pozivi su awaitani.
- `bunx tsc -p tsconfig.app.json --noEmit` → 0 errora (zero-any policy held).
- `bun run lint` → zeleno.
- `bunx vitest run src/test/subject-settings-merge.test.ts` → pass (eventualno prilagoditi await ako test direktno zove `saveSubjectSettings`).

### Memo
Dodati kratak `mem://features/data-integrity-v4` update (ili novi entry `data-integrity-pr-g1`): "PR-G1 verified — M1/M3/M4 shipped; M2 finalised — `save{App,Subject}Settings` async + throw, 3 call-sites await + toast.error na SSOT fail."

### Šta NE diramo
- Quit-backup timeout (30s ostaje).
- `clearSubjectSettings` — delete je idempotentan, ostaje void.
- `loadAppSettingsAsync` i `_cache` hydrate path — read-only, van scope-a C-2.
- Bilo kakvi storage/architecture refaktor — surgical fix samo.

Reci `Implement plan` da izvršim M2 fix + memo.