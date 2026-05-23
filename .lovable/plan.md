
# Plan: Razdvajanje Boot Sekvence i Migracija (Ograničenja #6 + #7)

## Trenutno stanje

`useCardBootstrap` orkestrira sve sekvencijalno: `bootDb → runMigrations → loadInitialData → normalizeCategories → setState`. State machine (`src/lib/boot/bootStateMachine.ts`) već postoji, ali:

- **`runMigrations` miješa tri stvari**: Dexie verzioni upgrade (`migrateFromLocalStorage`), data migracije (mnemonics, frequency tags), i data healing (`healCardTaxonomy`).
- **`normalizeCategories` je *drugi* heal pass** — phantom prune + fallback subcat synthesis — koji se izvršava poslije `loadInitialData`, dakle van faze "migrating".
- **Granularnost grešaka je 0**: bilo koji throw padne u jedan `catch` koji emituje `CORRUPTED` sa generičkom porukom. Korisnik vidi splash error, ali ne zna *koja* faza je pukla, da li je heal idempotentan, niti može pokrenuti recovery.
- **Nema UI konzumera `useBootState()`** — `BootStateProvider` je trenutno no-op wrapper. Sva UX se i dalje radi kroz `splash.ts` DOM manipulaciju (`splash-progress`, `splash-error`).

## Šta želimo

Tri eksplicitne, nezavisno fail-safe faze, svaka sa svojim error stanjem i recovery akcijom, vidljive kroz `useBootState()`:

```text
  Phase 1: SCHEMA           Phase 2: HEAL              Phase 3: LOAD/RENDER
  ─────────────────         ─────────────────          ─────────────────
  ensureDbOpen              healCardTaxonomy           idbLoad* (parallel)
  Dexie upgrade             normalizeCategories        cache init
  legacy migrations         frequency-tag migrate      repository.replaceAll
  outbox WAL recovery       (sve idempotentno)         transition(READY)
  ↓                         ↓                          ↓
  schema-error              heal-error                 load-error
  (blocked/version)         (recoverable, skip)        (corrupted)
```

Pravilo: **schema mora uspjeti** (bez nje nema ničega), **heal je best-effort i skippable** (čak i ako sve heal-funkcije puknu, app boot-uje sa "Heal preskočen" toast-om), **load grešku tretiramo kao corrupted** ali dajemo recovery akcije (Recover from backup / Reset DB / Continue read-only).

## Implementacija — 5 PR-ova

### PR-1 — Proširi state machine sa tri eksplicitne faze

`src/lib/boot/bootStateMachine.ts`:
- Zamijeniti generički `migrating` sa tri stanja:
  - `{ type: "schema"; pct: number; label: string }`
  - `{ type: "healing"; pct: number; label: string; skipped: string[] }`
  - `{ type: "loading"; pct: number; label: string }` (već postoji)
- Nova error stanja: `{ type: "schema-error"; cause: SchemaErrorCause; message: string }` (cause ∈ `version | blocked | timeout | unknown`) i `{ type: "load-error"; message: string }`. `corrupted` ostaje kao terminalno fallback za ne-recoverable greške.
- Novi eventi: `SCHEMA_START`, `SCHEMA_PROGRESS`, `SCHEMA_DONE`, `SCHEMA_FAIL`, `HEAL_START`, `HEAL_PROGRESS`, `HEAL_STEP_FAIL` (kumulativan — dodaje u `skipped[]`, ne menja fazu), `HEAL_DONE`, `LOAD_FAIL`, `RECOVERY_REQUESTED`.
- Reducer: schema-error → može u `schema` kroz `RECOVERY_REQUESTED` (retry); heal-error nema (heal step fail ne mijenja fazu); load-error → može u `loading` kroz `RECOVERY_REQUESTED`.
- Update `src/test/boot-state-machine.test.ts` da pokriva nove tranzicije, naročito da `HEAL_STEP_FAIL` ne izbacuje iz `healing` faze.

Stari eventi (`MIGRATE_START`, `MIGRATE_DONE`, `OPEN_*`) ostaju kao **deprecated aliasi** koji mapiraju na nove (radi backward kompat sa `bootDb.ts` koji još emituje `OPEN_*`).

### PR-2 — Razdvoji `runMigrations` u `runSchema` + `runHeal`

`src/hooks/card-bootstrap/runSchema.ts` (novo):
- Sadrži: `migrateFromLocalStorage` (Dexie upgrade), `migrateMnemonicsFromLocalStorageToIDB`, `recoverOutboxOnBoot`.
- Sve unutar `withTimeout`; ako bilo koji baci, emituje `SCHEMA_FAIL` sa konkretnim korakom u poruci i throw-uje (orchestrator hvata).
- Emituje `SCHEMA_PROGRESS` sa labelama "Schema upgrade…", "Mnemonics migracija…", "Outbox recovery…".

`src/hooks/card-bootstrap/runHeal.ts` (novo):
- Sadrži: `healCardTaxonomy`, plus poziva nov `healCategoryShapes(catRecords, cards)` ekstraktovan iz `normalizeCategories.ts` (legacy string[] → SubcategoryNode[], phantom prune, fallback synthesis).
- Svaki heal korak u svom `try/catch`; ako padne, log + `transition({ type: "HEAL_STEP_FAIL", step: "taxonomy" | "categoryShapes" | ... })` i nastavlja sa sljedećim. Heal nikada ne throw-uje na gore.
- Vraća `{ finalRecords, skippedSteps: string[] }`.

`src/hooks/card-bootstrap/normalizeCategories.ts`:
- Ostaje kao čista pure funkcija `normalizeCategoryShapes(input): { records, needsPersist }` (no DB write, no logger.warn na fail — vraća rezultat).
- IDB persist se izdvaja u zaseban helper koji `runHeal` poziva sa svojim catch wrapper-om.

`runMigrations.ts` postaje shim koji poziva `runSchema()` (backward kompat za sve eksterne pozivaoce, ako ih ima — provjera kroz `rg "runMigrations"`).

### PR-3 — Refaktor `useCardBootstrap` u eksplicitan DAG

Novi orchestrator:

```ts
useEffect(() => {
  (async () => {
    try {
      // Phase 1
      const dbOk = await bootDb();             // emits SCHEMA_START internally
      if (!dbOk) return;                        // state machine already in schema-error
      await runSchema();                        // throws → caught below as schema fail
      transition({ type: "SCHEMA_DONE" });

      // Phase 2 — never throws on gore
      const { cards, catRecords, log, settings } = await loadInitialData();
      transition({ type: "HEAL_START" });
      const { finalRecords, skippedSteps } = await runHeal({ cards, catRecords });
      transition({ type: "HEAL_DONE", skipped: skippedSteps });

      // Phase 3
      cardRepository.replaceAll(arrayToMap(cards));
      categoryRepository.replaceAll(finalRecords);
      setReviewLogState(log);
      setSrSettingsState(settings);
      transition({ type: "READY" });
    } catch (err) {
      // Razlikuj schema-fail vs load-fail po fazi u kojoj smo bili
      const current = getBootState();
      if (current.type === "schema" || current.type === "opening") {
        transition({ type: "SCHEMA_FAIL", cause: "unknown", message: msg(err) });
      } else {
        transition({ type: "LOAD_FAIL", message: msg(err) });
      }
    } finally {
      setReady(true);  // ready=true znači "boot je završio" (ne nužno success);
                       // UI gleda useBootState() za phase
      cleanupSplash();
      notifyElectronReady();
    }
  })();
}, []);
```

Ključna promjena: `loadInitialData` se premešta **iznad** heal-a (heal je sada čisto post-load operacija), što odgovara user mentalnom modelu "schema → load → fix data → render".

Panic timer (8s) ostaje, ali ako se okine i state nije `ready`, emituje `transition({ type: "LOAD_FAIL", message: "Panic timeout" })` umjesto da samo forsira `ready=true`.

### PR-4 — `BootRecoveryGate` komponenta

`src/contexts/boot/BootRecoveryGate.tsx` (novo) — postavlja se kao child od `BootStateProvider` (ili oko App-a u `main.tsx`):

```tsx
const state = useBootState();
if (state.type === "schema-error") return <SchemaErrorScreen state={state} />;
if (state.type === "load-error" || state.type === "corrupted") return <LoadErrorScreen state={state} />;
// healing/loading: koristi postojeći splash (DOM-based), ali optional in-React overlay sa skipped[] preview
return <>{children}</>;
```

`SchemaErrorScreen` (novo, `src/components/boot/`):
- Mapira `cause` u user-friendly poruku: `version` → "Verzija baze ne podudara sa instaliranom aplikacijom" + dugme "Force reload (close other tabs)"; `blocked` → "Druga instanca CODEX-a drži bazu otključanom"; `timeout` → "Baza se nije otvorila u 6s"; `unknown` → tehnička poruka.
- Akcije: **Retry** (emituje `RECOVERY_REQUESTED`, reload window), **Export current data** (poziva existing backup eksport ako je DB djelimično dostupna), **Reset DB** (delete + reload sa potvrdom).

`LoadErrorScreen` (novo):
- Iste 3 akcije + **Continue with empty state** (emituje `READY`, app radi sa praznim repositorima — read-only za korisnika dok ne uradi restore).

Ovo eliminiše "bijeli ekran smrti" — korisnik uvijek dobije akcijabilni screen.

### PR-5 — Splash bridge + telemetrija

`splash.ts`:
- Dodati `subscribeBootState` listener koji automatski mapira fazu u splash UI (pct, label). Ručni `splashProgress()` pozivi se uklanjaju iz `bootDb/runSchema/loadInitialData/runHeal` — single source of truth postaje state machine.
- `cleanupSplash` se sada okida na `READY | schema-error | load-error`, ne više u `finally` blok-u orchestratora.

Telemetrija:
- Novi event u `boot-trace`: `boot:phase:enter` i `boot:phase:exit` sa duration. Dobijamo prirodni waterfall: schema 320ms, heal 80ms, load 410ms.
- Ako `HEAL_STEP_FAIL` ima items u `skipped[]` na kraju, dodati `boot:heal-degraded` step sa listom — pomaže debug.

### Testovi (uz svaki PR, ali izdvojeno radi pregleda)

`src/test/boot-orchestrator.test.ts` (novo):
1. **happy path** — schema OK → heal OK → load OK → state završava u `ready`.
2. **schema fail** — `migrateFromLocalStorage` throw → state `schema-error`, `loadInitialData` se *ne* poziva.
3. **heal partial fail** — `healCardTaxonomy` throw, `healCategoryShapes` OK → state ide kroz `healing` u `loading` u `ready`, `skipped: ["taxonomy"]` vidljiv.
4. **load fail** — `idbLoadCards` throw → state `load-error`, repositori ostaju prazni.
5. **panic timeout** — promise nikad ne riješi → 8s panic → `LOAD_FAIL` emit, splash forsiran, `ready=true`.

Mock `idbLoadCards`, `migrateFromLocalStorage`, itd. preko `vi.mock`.

## Tehničke odluke

- **Bez XState** — `BootEvent`/`reduce` pattern je već imamo i dovoljno je za 7 stanja. Dodatna dep nije opravdana.
- **Heal je idempotentan i pojedinačni step-ovi su `try`-wrapped** — to znači da boot uvijek napreduje; degradiranje je vidljivo ali ne blokira.
- **`bootDb.ts` ostaje** ali interno emituje nove `SCHEMA_*` evente (preko alias mapinga iz PR-1). Ne želimo touch-ati `ensureDbOpen` API.
- **Backward kompat alias-i u state machine-u** se uklanjaju u zasebnom cleanup PR-u nakon što sve potvrdimo.
- **`finally { setReady(true) }`** ostaje radi parent komponenata koje gate-uju render na `ready`, ali stvarno health stanje čita `BootRecoveryGate`.

## Šta NE radimo u ovom planu

- Migracija na pravi DAG runner (npr. odvajanje cache init / outbox recovery u paralelne grane) — to je sljedeći korak nakon što imamo fazni okvir.
- Schema-version aware migracije (`from`/`to` su trenutno 0/0 placeholderi) — može u zasebnom PR-u kada budemo imali numbered migration scripts.
- Restore-from-backup unutar `LoadErrorScreen` — koristi postojeći backup engine, nije nova funkcionalnost.

## Acceptance kriterijumi

- `useBootState()` u dev konzoli prolazi kroz `idle → opening → schema → healing → loading → ready` u happy path-u.
- Namjerno baci u `healCardTaxonomy` → app boot-uje, vidljiv "Heal degradiran: taxonomy" indikator.
- Namjerno baci u `migrateFromLocalStorage` → SchemaErrorScreen sa Retry/Reset/Export.
- Namjerno baci u `idbLoadCards` → LoadErrorScreen sa "Continue empty".
- `boot-orchestrator.test.ts` 5/5 prolazi.
- Bundle delta < 2KB gzip (samo new module-i, bez dep-a).
