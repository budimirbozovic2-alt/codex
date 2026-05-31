# PR-G4 (RC-4): Timer/Listener disciplina

Cilj: svi `setTimeout` / `setInterval` izvan whitelistovanih tight-loop modula (Pomodoro engine, SpeedReader RSVP, sam `taskScheduler`, test helperi, `useDebounce` primitive) moraju ići kroz `taskScheduler`, sa eksplicitnim `label`-om i cleanup-om. Cilj je eliminisati memory leak i "timer-after-unmount" race condition.

## Skup izmjena

### 1. Audit i klasifikacija (≈35 fajlova)

Tri kategorije:

- **MIGRATE** → prepisati na `taskScheduler.setTimeout/setInterval` sa `label` i cleanup-om kroz vraćeni handle (`taskScheduler.cancel(handle)`).
- **WHITELIST** → ostaviti raw, ali komentar `// timer-whitelist: <razlog>` i dodati u ESLint exception listu.
- **REFACTOR-TO-HOOK** → komponentni tajmeri bez ref-cleanup-a prelaze kroz mali wrapper `useScheduledTimeout`/`useScheduledInterval` (novi fajl `src/hooks/useScheduled.ts`) koji garantuje `cancel` u `useEffect` cleanup-u.

Konkretna podjela (na osnovu `rg` audita):

| Fajl | Akcija |
|---|---|
| `src/main.tsx` (splash remove 300ms) | MIGRATE, label `boot:splashRemove` |
| `src/components/db/BlockingModal.tsx` (1s interval) | MIGRATE → `taskScheduler.setInterval`, label `blockingModal:tick` |
| `src/components/ZenMode.tsx` (1s countdown interval) | MIGRATE, label `zenMode:countdown` |
| `src/components/ProcessingOverlay.tsx` | MIGRATE |
| `src/components/MainLayout.tsx`, `ExamSidebar.tsx` | MIGRATE |
| `src/components/SourceReader.tsx` | MIGRATE |
| `src/components/GlobalSearch.tsx` (debounce 60s cache) | MIGRATE |
| `src/components/learn/StudyModeRecall.tsx` | MIGRATE |
| `src/components/settings/PersonalizationTab.tsx` | MIGRATE |
| `src/lib/persist-queue.ts` (3 raw timeouts) | MIGRATE, label `persistQueue:flush*` |
| `src/lib/zip-service.ts` (idle GC + per-op timeout) | MIGRATE, label `zipService:*` |
| `src/lib/electron-integration.ts` | MIGRATE |
| `src/lib/emergency-export.ts` | MIGRATE |
| `src/lib/sounds.ts` | MIGRATE ili WHITELIST (audio decay) — odluka po sadržaju |
| `src/lib/repositories/reviewLogRepository.ts` | MIGRATE |
| `src/lib/query/bridges.ts` | MIGRATE |
| `src/lib/body-pointer-events-guard.ts`, `backup/yield-ui.ts` | MIGRATE |
| `src/hooks/useDraftAutosave.ts`, `useDeferredCompute.ts`, `useCardBootstrap.ts`, `useMindMapCanvas.ts`, `usePersistingState.ts`, `useNotificationScheduler.ts`, `useWikiLinkAutoCreate.ts` | MIGRATE (preko `useScheduled*`) |
| `src/hooks/mindmap/useNodeEditing.ts`, `card-bootstrap/{withTimeout,splash}.ts` | MIGRATE |
| `src/features/docx-importer/docx-parser.ts`, `features/mnemonic/hooks/useTestEngine.ts` | MIGRATE |
| `src/hooks/speed-reader/useSpeedReaderEngine.ts` | **WHITELIST** (sub-frame RSVP loop, već pomenuto u zaglavlju scheduler-a) |
| `src/store/usePomodoroStore.ts` | **WHITELIST** (engine drift budget) |
| `src/hooks/useDebounce.ts` | **WHITELIST** (low-level primitive; pokriva ga onaj koji ga zove) |
| `src/test/helpers/timers.ts`, `*.test.*` | **WHITELIST** (testovi koriste `vi.useFakeTimers`) |
| `src/lib/scheduler/taskScheduler.ts` | **WHITELIST** (implementacija) |

### 2. Novi util `src/hooks/useScheduled.ts`

Dva tanka hooka:

```ts
useScheduledTimeout(fn, ms, label, deps)   // returns void; cleanup auto-cancels
useScheduledInterval(fn, ms, label, deps)  // returns void; cleanup auto-cancels
```

Interno: `useEffect(() => { const h = taskScheduler.setTimeout(fn, ms, { label }); return () => taskScheduler.cancel(h); }, deps)`.

### 3. ESLint guard (W15)

U `eslint.config.js` dodati `no-restricted-globals` / `no-restricted-syntax` pravilo:

```
{
  selector: "CallExpression[callee.name=/^(setTimeout|setInterval)$/]",
  message: "Use taskScheduler.setTimeout/setInterval (PR-G4 timer discipline)."
}
{
  selector: "CallExpression[callee.object.name='window'][callee.property.name=/^(setTimeout|setInterval)$/]",
  message: "..."
}
```

Sa `overrides` za whitelistovane fajlove (`taskScheduler.ts`, `useSpeedReaderEngine.ts`, `usePomodoroStore.ts`, `useDebounce.ts`, `**/*.test.*`, `src/test/helpers/timers.ts`).

### 4. Regresioni test

`src/test/pr-g4-timer-discipline.test.ts`:

- (a) `vi.useFakeTimers()` + render `BlockingModal` → unmount prije advance → assert da `taskScheduler.snapshot()` ne sadrži `blockingModal:tick`.
- (b) statički guard: `fs.readFile` na listi whitelistovanih fajlova i `grep` ostalih src fajlova; assert da nijedan src fajl van whitelist-a ne sadrži `\bsetTimeout(` ili `\bsetInterval(` (osim u stringovima/komentarima — koristi jednostavan regex sa exclude-om `//` linija).

### 5. Memorija

Update `mem://technical-choices/task-scheduler` sa novim invariantom i listom whitelisted modula. Update `mem://index.md` Core ako treba (već postoji referenca).

## Verifikacija

1. `bunx eslint src --max-warnings=0` — 0 violation za novo W15 pravilo.
2. `bunx tsc --noEmit` — 0 grešaka.
3. `bunx vitest src/test/pr-g4-timer-discipline.test.ts` — sve zeleno.
4. Smoke: pokrenuti app, otvoriti/zatvoriti ZenMode i BlockingModal, provjeriti da `taskScheduler.snapshot()` u konzoli vraća prazno nakon close.

## Što PR-G4 NE radi

- Ne dira tight-loop module (Pomodoro, SpeedReader) — namjerno whitelist.
- Ne refactoriše Pomodoro engine na scheduler (sub-frame drift budget).
- Ne mijenja API `taskScheduler`-a; samo ga koristi.
