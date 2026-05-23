# Greenfield Finalization — 3 zadatka

## Preliminarna provjera (bitno!)

- **Zod već postoji** kao dependency (`zod ^4.4.1`) i **`src/lib/migrations/backup-schema.ts` već implementira pun Zod parser** za backup payload (sa `.strict()`, `sanitizeHtml` transformima, SafeText/SafeHtml helperima). `import-transaction.ts` već konsumira `ParsedBackup`. Zadatak #3 stoga **nije "uvedi Zod"** nego **audit + plombiranje rupa**.
- `taskScheduler` ima `debounce(fn, ms, opts)` — Zadatak #2 ima sve što mu treba.
- ESLint config već koristi `no-restricted-syntax` za druge stvari (raw boje, eventBus literali) — dodavanje timer guard-a je proširenje istog bloka.

---

## Zadatak 1 — ESLint guard za `setTimeout` / `setInterval`

### Pristup
Proširiti postojeći `no-restricted-syntax` blok u `eslint.config.js` sa dva selektora koji ciljaju globalne `CallExpression`. Koristiti **per-file override blokove** za dozvoljene lokacije (umjesto inline `eslint-disable` komentara po fajlu — manje šuma, lakša revizija).

### Konkretne izmjene

**`eslint.config.js` — globalni guard:**
```js
{
  selector: "CallExpression[callee.name='setTimeout']",
  message: "Koristi taskScheduler.setTimeout() (src/lib/scheduler). Raw setTimeout je dozvoljen samo u taskScheduler.ts, Pomodoro/SpeedReader engine-ima i testovima.",
},
{
  selector: "CallExpression[callee.name='setInterval']",
  message: "Koristi taskScheduler.setInterval() (src/lib/scheduler). Raw setInterval je dozvoljen samo u taskScheduler.ts i Pomodoro engine-u.",
},
```

**Allow-list (per-file override, dodaje `no-restricted-syntax: "off"` ili ciljano isključuje samo timer pravila):**
- `src/lib/scheduler/taskScheduler.ts` (implementacija)
- `src/contexts/pomodoro/usePomodoroEngine.ts` (sub-frame timing)
- `src/hooks/speed-reader/useSpeedReaderEngine.ts` (RSVP)
- `src/contexts/ui/useNotificationScheduler.ts` (preexisting whitelist)
- `src/test/**` (fake timers)
- `src/lib/persist-queue.ts` — **OPREZ**: trenutno koristi `window.setTimeout(flush, 16)` i `window.setTimeout(flush, delay)` za retry. Treba odluka: ili premjestiti na scheduler (gubi se 16ms frame-tick semantika ako ide kroz `priority: high`), ili dodati u whitelist. **Preporuka:** migrirati flush tick na `taskScheduler.setTimeout(flush, 16, { label: "persist-queue-flush", priority: "high" })` i retry takođe; zatim BEZ izuzetka.

**Plus migracija preostalih `setTimeout` poziva** (iz prethodne G1/G3/G4):
- `src/lib/sounds.ts` (3 poziva za nizove tonova) — migrirati na scheduler sa `label: "sound-tone"`
- `src/lib/electron-integration.ts:128` (5s timeout wrapper) — već postoji `withTimeout` helper, refactor
- `src/components/MainLayout.tsx:65` (30min nudge cooldown)
- `src/components/ProcessingOverlay.tsx`, `ExamSidebar.tsx`, `GlobalSearch.tsx` (UI delay/focus — sve na scheduler sa `pauseWhenHidden: false`)
- `src/hooks/useMindMapCanvas.ts` (3 poziva: fitView delay 50ms × 2, autosave 30s)
- `src/components/ZenMode.tsx:75`, `src/components/settings/PersonalizationTab.tsx:84` (sound feedback)
- `src/lib/db-schema.ts:348` (reload delay) i `:415` (200ms polling) — ovi su pre-boot, `taskScheduler` možda još nije inicijalizovan; **dodati u whitelist sa komentarom**.

### Verifikacija
- `bun run lint` mora proći sa nulom timer-pravila violacija
- Dodati `src/test/no-raw-timers.test.ts` koji programski pokreće ESLint preko `src/**/*.{ts,tsx}` i očekuje 0 violation-a (paralelno sa postojećim `task-scheduler-eslint.test.ts` pattern-om iz plana)

### Risk
- Pomodoro engine **MORA** ostati whitelist-ovan (sub-frame timing)
- Persist queue migracija je suptilna — `taskScheduler.setTimeout` ide kroz dodatni layer; testirati da li 16ms coalescing tick i dalje radi pod load-om

**Effort:** ~3h (config + migracija ~12 fajlova + test)

---

## Zadatak 2 — Unifikovani `useDraftAutosave` hook

### Trenutno stanje (3 paralelne implementacije)
- `src/hooks/useCardDraftAutosave.ts` — koristi `useRef<latestRef>`, `useDebounce`, custom save flow, error fallback toast
- `src/hooks/zettelkasten/useArticleDraft.ts` — stale-closure prevention preko useRef, save-on-exit semantika
- `src/hooks/card-actions/useSectionEditor.ts` + `useCardDraft.ts` — section-level editor sa custom dirty tracking

Svaki ima:
1. svoju verziju debounce-a (jedan koristi `useDebounce` hook, drugi inline timer, treći save-on-blur)
2. svoju verziju "latest ref" zaštite od stale closure
3. svoj način signalizacije "dirty" stanja u UI (`useDirtyDialog`)
4. različite strategije za "save before unmount"

### Predloženi unified API

**`src/hooks/useDraftAutosave.ts`** (novi, ~120 LOC):
```ts
interface DraftAutosaveOptions<T> {
  /** Stable key — drafts with the same key share dirty state (cross-tab safe via BroadcastChannel) */
  key: string;
  /** Current source-of-truth value (e.g. saved card from IDB) */
  source: T;
  /** Equality function — default Object.is; pass struct-eq for deep compare */
  equals?: (a: T, b: T) => boolean;
  /** Persist function — must be idempotent (called multiple times if user types fast) */
  save: (draft: T) => Promise<void>;
  /** Debounce ms (default 800) */
  debounceMs?: number;
  /** Save on blur/unmount/visibility-hidden (default: true) */
  saveOnExit?: boolean;
  /** Optional draft persistence to IDB `drafts` table (default: false; opt-in for editors where data loss is unacceptable) */
  persistDraft?: boolean;
}

interface DraftAutosaveReturn<T> {
  draft: T;
  setDraft: (next: T | ((prev: T) => T)) => void;
  isDirty: boolean;
  isSaving: boolean;
  saveNow: () => Promise<void>;        // imperatively flush
  discard: () => void;                  // revert draft to source
  registerNavGuard: () => () => void;   // hook into useDirtyDialog
}

export function useDraftAutosave<T>(opts: DraftAutosaveOptions<T>): DraftAutosaveReturn<T>;
```

### Implementacioni detalji
- **Debounce** preko `taskScheduler.debounce(save, debounceMs, { label: "draft:"+key, pauseWhenHidden: false })`
- **Latest-ref** interno (jedna implementacija, ne 3)
- **`saveOnExit`** kombinuje 3 signala: `visibilitychange → hidden`, component unmount, `beforeunload`
- **`persistDraft: true`** — opciono piše draft u novu Dexie `drafts` tabelu (key, payload, updatedAt). Boot-time recovery: u `useCardBootstrap` provjeriti `drafts` tabelu i ponuditi resume (toast: "Pronađena je nesačuvana izmjena — vrati / odbaci"). **Ovo je pravo rješenje za "aplikacija se ugasi prije debounce-a opali"** rizik iz analize.
- **`isDirty`** — derivirano kroz `!equals(draft, source)`, ne kroz manualni flag. Auto-reset kad save uspije.
- **`registerNavGuard`** — vraća unsubscribe; pod hood pretplaćuje hook na centralni `useDirtyDialog` registar (jedna globalna lista dirty key-eva, dijalog pita prije navigacije ako ima ≥1).

### Migracija (postupna, ne big-bang)
1. **PR 1:** Napraviti hook + test + `drafts` Dexie tabela (v19 schema bump)
2. **PR 2:** Migrirati `useCardDraftAutosave` (najprostije) — sve postojeće pozivaoce ostaviti, samo unutra delegirati
3. **PR 3:** Migrirati `useArticleDraft` (Zettelkasten)
4. **PR 4:** Migrirati `useSectionEditor` / `useCardDraft`
5. **PR 5:** Ukloniti `useDebounce.ts` ako ima nula pozivaoca (sva debounce prošla kroz scheduler)

### Edge cases za test
- Brzo kucanje pa odmah navigacija → save mora ići pre route change
- App crash između save-a → boot detektuje `drafts` row i nudi resume
- Dva tab-a edituju isti zapis → BroadcastChannel obavještava "draft moved", drugi tab ulazi u read-only
- `equals` vraća true odmah nakon save-a → `isDirty` mora pasti na false

**Effort:** ~1 dan core + ~1 dan migracija svih pozivaoca + test coverage

---

## Zadatak 3 — Backup Zod audit (NIJE "uvedi Zod")

### Realnost
`src/lib/migrations/backup-schema.ts` već postoji i sadrži `.strict()` Zod parser-e sa `sanitizeHtml`/`SafeText` transformima. `import-transaction.ts` već prima `ParsedBackup` (Zod output). Tvrdnja iz analize *"baza prima nevalidirane podatke iz fajla"* je **netačna za main backup path**.

### Šta zaista treba uraditi — audit i plombiranje

**3a. Audit coverage matrice** — provjeriti koje sve tabele iz `db-schema.ts` su pokrivene Zod schema-om. Vjerovatne rupe (prema importu samo `KnowledgeBaseArticle`, `MindMapDoc`, `Source`, `MnemonicCard`, `CategoryRecord`, `Card`):
- `reviewLog` — provjeriti da li ima `ReviewLogEntrySchema`
- `metacognitive*` tabele (diary, time distribution, examiner profile)
- `plannerCache`, `subjectPlans`, `disciplineLog`, `streaks`
- `zettelkastenAliases`, `zettelkastenTags`
- `appSettings`, `srSettings`
- Crash logs (vjerovatno se preskaču, treba potvrditi)

**Output:** tabela `[Dexie table] × [in backup? yes/no] × [Zod schema? yes/no/partial]`. Sve gdje je "yes/no" ili "yes/partial" je rupa.

**3b. `parseBackup` ulazna kapija** — provjeriti **GDJE se Zod parse poziva**:
- Iz `useCardImport` glavnog flow-a? ✓ vjerovatno
- Iz `Full Restore` (electron file → import)? ❓ verifikovati
- Iz "atomic backup" kojeg pravi `electron/backup.cjs`? ❓ ovo je *.codex.json* format — možda zaobilazi schema
- Iz drag-drop on dashboard? ❓
- Iz CLI/dev tools? Nebitno

Sva mjesta gdje payload ulazi u IDB **moraju** proći kroz `backupSchema.parse(raw)`. Ako bilo gdje postoji `JSON.parse(file)` koji direktno hrani `db.cards.bulkPut(...)`, to je rupa.

**3c. Failure UX** — kad Zod baci `ZodError`:
- Trenutno: vjerovatno generic toast "import failed"
- Predloženo: parse `error.issues`, prikaži prvih 5 path/poruka u toast/dialog, ponudi "preskoči nevalidne i nastavi" (filter validne entry-je individualno)

**3d. Forward-compat** — `.strict()` baca na unknown fields. Ako backend doda novo polje u `Card` v5 backup, stariji import (pre-update) puca. Treba odluka:
- ostaviti `.strict()` (sigurnije, ali krhko pri schema evoluciji) 
- promijeniti na `.strip()` (default) sa `superRefine` validacijom poznatih polja (fleksibilnije)
- **Preporuka:** `.strict()` + verzionisanje (`backup.schemaVersion: 1|2|3`) sa ladder migracija (već postoji `migrateBackup` ladder po memoriji — provjeriti integraciju)

### Konkretni deliverable
1. Audit dokument (~1h analize): koje tabele nedostaju, koji ulazi zaobilaze
2. Dodavanje Zod schema za nedostajuće tabele (1-3h po tabeli)
3. Centralni `validateBackupOrThrow(raw): ParsedBackup` ulazni helper sa friendly error mapping
4. Test fixture: `corrupted-backup.json` sa 5 različitih grešaka — svaki mora biti odbijen sa jasnom porukom, IDB nepromjenjeno
5. Test: `partial-recovery.json` — 100 kartica, 10 corrupt → import 90, prijavi 10

**Effort:** 1-2 dana zavisno od rupa otkrivenih u audit-u

---

## Sugestije za **bolje** rješenje (umjesto / pored zatraženog)

### Bolje od #1 (ESLint guard)
Dodati i **runtime detekciju** u DEV mode: monkey-patch `globalThis.setTimeout` u `main.tsx` (DEV only) koji loguje stack trace svaki put kad se pozove iz fajla van whitelist-a. ESLint hvata pisanje koda; ovo hvata **import-ovan** kod iz biblioteka koje kradu thread (npr. neka 3rd-party lib otvara setInterval na boot). 
**Effort:** +30min, vrijednost: visoka za debugging future regressija.

### Bolje od #2 (Draft hook)
Razmisliti o **dvonivo arhitekturi**:
- **Level 1 (lightweight):** `useLocalDraft(source)` — samo lokalni state + dirty flag, bez persist. Za polja koja se ionako čuvaju on-blur (ime kategorije, naslov).
- **Level 2 (full):** `useDraftAutosave({ persistDraft: true })` za RTE, Zettel, dugačke eseje gdje data loss = real problem.

Inače rizikuješ over-engineering za polja koja ne trebaju IDB draft tabelu.

### Bolje od #3 (Zod backup)
**Brutalni trik:** umjesto ručno održavanog Zod schema, generisati Zod iz Dexie type-ova (postoji paket `ts-to-zod` ili custom AST script). Kad dodaš polje u `Card` interface, schema se sama ažurira. Cijena: build-time codegen step. Vrijednost: nemoguća drift Zod schema vs runtime tipovi (čest izvor false-negative validacije).

**Alternativa:** ostaviti ručni Zod (kao sada) ali dodati `src/test/backup-schema-drift.test.ts` koji ekstraktuje keys iz oba interface-a (Dexie Card vs Zod Card) i poredi — fail ako ima drift.

### Bolje od svih 3 zajedno
Iz prethodne analize: **draft hook (#2) i persist-queue refactor (problem #7) su isti problem na različitim nivoima** — oba su "kako sigurno doći iz user input-a do IDB-a sa nula data loss-a". Razmisliti da li `useDraftAutosave` + `cardCommandBus` mogu da konsoliduju i `persist-queue` retry logiku → jedna `WriteUnitOfWork` apstrakcija. Ovo je veće, ali ukida 2 strukturna problema odjednom. **Effort:** +1 nedjelja, vrijednost: ukida latent data-loss rizik.

---

## Predlog redoslijeda

1. **Zadatak 1** prvi (najbrži, najmanji rizik, zaključava progress prije ostalih izmjena)
2. **Zadatak 3 audit** drugi (pasivan rad — možda nema rupa, brzo se završi)
3. **Zadatak 2** zadnji (najveći, najviše dodira)

Ukupan effort: ~5-7 radnih dana ako se rade sekvencijalno, sa solidnim test coverage-om.
