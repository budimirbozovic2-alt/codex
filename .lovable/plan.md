# Plan: ESLint Public API zidovi + Task Scheduler

Dva nezavisna ali komplementarna posla. Mogu se mergati odvojeno; ne diraju runtime ponašanje (osim Schedulera koji centralizuje već postojeće timere).

---

## Dio A — ESLint Public API zidovi

**Cilj:** spriječiti deep import-e u domene koje sada imaju jasan public API (repositories, store, lib/db), tako da naredne faze IDB-as-SSOT migracije ne dobiju nove "back-door" ulaze. Ovo je čisto lint pravilo — zero runtime change.

### A1. Repositories barrel

1. Kreirati `src/lib/repositories/index.ts` koji re-exportuje samo javni API:
   - `cardRepository`, `categoryRepository`, `reviewLogRepository`, `settingsRepository`
   - `cardMapInvalidator`, `categoryStateInvalidator` (samo za boot/test setup)
2. Interne helpere (npr. privatne `commit`/`rollback` util-e ako se izdvoje) ne re-eksportovati.

### A2. Store barrel

1. Kreirati `src/store/index.ts` sa javnim hook-ovima:
   - `useCardMap*`, `useCardSelectors*`, `useCardsBySource`, `useCategory*`, `useSourceReaderStore`.
2. `useCardSelectorsFromDb` ostaje dostupan kao opt-in (export-ovan, ali sa JSDoc napomenom da je iza feature flag-a).

### A3. db barrel hardening

1. `src/lib/db/index.ts` (ako ne postoji, kreirati) eksportuje samo `db`, schema verzije i `queries/*` named queries.
2. Direktan `import { db } from "@/lib/db"` ostaje, ali se zabranjuje **van** `src/lib/**`, `src/contexts/**`, `src/hooks/card-bootstrap/**` i `src/test/**` (views već imaju to pravilo — proširujemo na komponente/features).

### A4. ESLint pravila (`eslint.config.js`)

Dodati novi override blok:

```js
// Public API walls — block deep imports into walled modules
{
  files: ["src/**/*.{ts,tsx}"],
  ignores: [
    "src/lib/repositories/**",
    "src/store/**",
    "src/lib/db/**",
    "src/test/**",
  ],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/lib/repositories/*"], message: "Importuj iz `@/lib/repositories` barrel-a." },
        { group: ["@/store/*"],            message: "Importuj iz `@/store` barrel-a." },
        { group: ["@/lib/db/queries/*"],   message: "Importuj iz `@/lib/db` barrel-a." },
      ],
    }],
  },
},
```

`@/features/*/*` već postoji — ostaje nepromijenjen.

### A5. Migracija postojećih import-a

- `rg "@/lib/repositories/(card|category|reviewLog|settings)" -l` → preusmjeriti na barrel.
- `rg "@/store/(useCard|useCategory|useSource|useCardsBy)" -l` → barrel.
- Sanctioned izuzeci (boot, testovi) ostaju kako jesu (pokrivenо `ignores`).

### A6. Test

`src/test/eslint-public-api.test.ts` — programmatic ESLint run nad fixturom koji pokušava deep import; očekuje grešku. Time se pravilo brani od slučajnog ublažavanja.

**Izlaz A:** ~50 file-ova migrirano na barrel import-e, 3 nova pravila, 1 novi test. Zero behavior change.

---

## Dio B — Centralizovani Task Scheduler

**Cilj:** sve raspršene `setTimeout` / `setInterval` / `requestIdleCallback` pozive (46+ mjesta) provući kroz jedan modul koji:

- vodi registar aktivnih zadataka (debug-friendly),
- gasi sve timere pri `beforeunload` / Electron `before-quit` (sprečava IDB write nakon unload-a),
- pauzira "low-priority" zadatke kad je tab skriven (`document.visibilityState === "hidden"`) i nastavlja ih pri povratku,
- daje jednu putanju za testove (`vi.useFakeTimers()` + ručno `scheduler.flush()`).

Ne diramo: Pomodoro engine (mora tačno tikati), notification scheduler (već domenski), Electron native timere.

### B1. Novi modul `src/lib/scheduler/taskScheduler.ts`

API:

```ts
type Priority = "high" | "normal" | "idle";

interface ScheduleOptions {
  label: string;            // obavezan, ide u debug registar
  priority?: Priority;      // default "normal"
  pauseWhenHidden?: boolean;// default true za "idle", false inače
  signal?: AbortSignal;
}

scheduler.setTimeout(fn, ms, opts): TaskHandle
scheduler.setInterval(fn, ms, opts): TaskHandle
scheduler.idle(fn, opts): TaskHandle           // rIC sa setTimeout fallback-om
scheduler.debounce(fn, ms, opts): (...args) => void
scheduler.cancel(handle): void
scheduler.cancelByLabel(prefix): number
scheduler.snapshot(): { label, priority, scheduledAt, kind }[]
scheduler.shutdown(): void                      // poziva se iz beforeunload
```

Interno: `Map<TaskHandle, TaskRecord>`. `pauseWhenHidden` zadaci se na `visibilitychange → hidden` čuvaju (preostali delay), na `visible` re-schedule-uju. `shutdown()` čisti sve i zaključava dalji `schedule*` (silent no-op u dev sa warning-om).

### B2. `src/lib/scheduler/index.ts`

Barrel + named singleton `taskScheduler`. Plus tipovi za eksternu konzumaciju.

### B3. Integracija sa lifecycle-om

- `src/main.tsx` — `window.addEventListener("beforeunload", () => taskScheduler.shutdown())`.
- `preload.cjs` / `electron-integration.ts` — slušati `onBeforeQuit` (postoji u tipovima) → `shutdown()` prije `notifyQuitBackupDone()`.

### B4. Migracija call-site-ova (po grupama, svaka commit-abilna zasebno)

| Grupa | Fajlovi | Priority |
|---|---|---|
| G1 boot/splash | `card-bootstrap/splash.ts`, `withTimeout.ts`, `useCardBootstrap.ts` | high |
| G2 debounce/draft autosave | `useDebounce.ts`, `useCardDraftAutosave.ts`, `useSourceEditing.ts`, `useNodeEditing.ts` | normal |
| G3 idle/deferred | `useDeferredCompute.ts`, `useWikiLinkAutoCreate.ts`, `useSourceSelection.ts` | idle |
| G4 maintenance | `log-retention.ts`, `persist-queue.ts`, `emergency-export.ts`, `event-bus.ts` (retry), `sounds.ts` | idle |
| G5 backup | `backup/yield-ui.ts`, `zip-service.ts` | normal |

**Ne diramo:** `usePomodoroEngine.ts`, `useNotificationScheduler.ts`, `useSpeedReaderEngine.ts` (RSVP tajming kritičan — ostaje raw `setTimeout` ali sa `label` komentarom).

Svaki migrirani poziv dobija eksplicitan `label` (npr. `"card-draft:autosave"`) — to je jedina semantička promjena.

### B5. ESLint guard (sinergija sa Dio A)

Novo `no-restricted-syntax` pravilo:

```js
{
  selector: "CallExpression[callee.name=/^(setTimeout|setInterval)$/]",
  message: "Koristi taskScheduler iz @/lib/scheduler. Izuzeci: pomodoro, speed-reader, notifications, scheduler internals.",
}
```

Sa `overrides` koji dozvoljavaju raw timere u:
- `src/lib/scheduler/**`
- `src/contexts/pomodoro/**`
- `src/contexts/ui/useNotificationScheduler.ts`
- `src/hooks/speed-reader/**`
- `src/test/**`

`requestIdleCallback` se ne ban-uje (rijetko korišten direktno; scheduler ga interno koristi).

### B6. Testovi

- `src/test/task-scheduler.test.ts` — fake timers: schedule/cancel/flush, `pauseWhenHidden` putanja (mock `visibilitychange`), `shutdown()` čisti sve, double-shutdown idempotentan.
- `src/test/task-scheduler-eslint.test.ts` — programmatic ESLint nad fixturom sa `setTimeout` koji nije u izuzetku.

**Izlaz B:** novi modul (~250 LOC), ~30 migriranih call-site-ova, 2 nova testa, 1 novo lint pravilo. Runtime ponašanje identično, ali sada postoji jedna tačka za debug/shutdown.

---

## Redoslijed i rizici

1. **Dio A prvo** (čisto lint, low risk, ubrzava review).
2. **Dio B** u 5 manjih PR-ova po grupi (G1…G5), svaki sa svojim testovima.
3. ESLint pravilo iz B5 se aktivira tek **nakon** zadnje grupe, da CI ne pukne tokom migracije.

**Rizik:** previd nekog tajming-kritičnog call-site-a tokom G2/G3 migracije.
**Mitigacija:** svaka grupa ima zaseban PR + manuelni smoke test (autosave, deferred compute, log retention).

**Trajanje:** Dio A ~1 dan, Dio B ~3-4 dana sa testovima.

## Pitanja za potvrdu

1. Da li je `pauseWhenHidden=true` po defaultu za `idle` prioritet OK? (alternativa: nikad ne pauzirati, samo logovati skip)
2. Treba li scheduler imati i `runAfterFrame` (rAF) API ili rAF ostaje raw (koristi se samo u mindmap canvas-u)?
3. Da li dozvoljavamo raw `setTimeout` u testovima bez ikakvog komentara, ili tražimo `// eslint-disable-next-line` da bude eksplicitno?
