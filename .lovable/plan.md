# PR-G3 → PR-G8: Završetak Deep Audit ciklusa

Sekvencijalno, jedan PR po koraku. Svaki PR završava `bunx tsc --noEmit` + relevantni `bunx vitest run` + memo update. Implementacija kreće od **PR-G3**.

---

## PR-G3 (RC-3): Stale closures & remount ugovori

**Cilj:** Komponente za učenje/pretragu/planer prestaju da prikazuju "zamrznute" podatke pri promjeni `categoryId` ili nakon TanStack invalidacije.

### Sumnjive tačke (iz audita + brzog skena)

1. **`src/hooks/useAnalyticsWorker.ts`** — `taskRef.current = task` na svakom renderu + `eslint-disable exhaustive-deps`. Klasičan zamrznuti closure: ako caller proslijedi `deps=[]` ali interno čita `categoryId`, nikad neće refetch-ovati. Audit treba per call-site (`useStatsData`, `useDashboardData`, `ResistanceTab`, `CognitiveAnalytics`).
2. **`src/components/GlobalSearch.tsx`** — Ctrl+K cache (60s module-level prema memoriji `card-search`). Provjeriti da li cache nosi `categoryId` u ključu i da li ga briše na `notifyCardsChanged` bridge invalidaciji.
3. **`src/views/CategoryView.tsx`** — već nosi `key={categoryId}` (App.tsx:49). Verifikovati da i `SubjectDashboard` (App.tsx:54), `ReviewPage`, `LearnPage`, `PlannerPage` koriste isti remount ugovor tamo gdje state nije izveden iz `useParams`.
4. **`src/hooks/useSession.ts` / Review** — sumnja: queue izgrađen jednom, ne reaguje na nove kartice u toku sesije.

### Plan

- Auditirati 4 tačke gore, popraviti **samo one koje stvarno cure** (ne dirati `useAnalyticsWorker` osim ako nađemo bug — taskRef je intentional).
- Za svaki popravak: ili dodati nedostajući dep u `useEffect`/`useQuery`, ili dodati `key={...}` remount ugovor, ili migrirati lokalni cache na `queryKey: [..., categoryId]` da invalidacija radi besplatno.
- Test: dodati 1 regression test po fix-u u `src/test/` (npr. "GlobalSearch invalidira cache na category change").

---

## PR-G4 (RC-4): Timer/listener disciplina

**Stanje:** ESLint G7 pravilo već zabranjuje raw `setTimeout`/`setInterval`. Ali `rg` nalazi **23 raw call-sitea** (van scheduler whitelist-a). Treba ih ili migrirati na `taskScheduler`, ili eksplicitno whitelistovati u `eslint.config.js` sa komentarom *zašto*.

### Klasifikacija callsiteova (već skenirano)

| Kategorija | Akcija |
|---|---|
| `src/main.tsx`, `src/lib/zip-service.ts`, `src/lib/persist-queue.ts`, `src/lib/query/bridges.ts`, `src/lib/repositories/reviewLogRepository.ts`, `src/lib/backup/yield-ui.ts`, `src/lib/electron-integration.ts` | **Infra** — ostaju, ali svaki `setTimeout` mora imati `clearTimeout` u cleanup/`unload`. Dodati ESLint inline `disable` sa razlogom. |
| `src/store/usePomodoroStore.ts`, `src/hooks/speed-reader/useSpeedReaderEngine.ts`, `src/features/mnemonic/hooks/useTestEngine.ts` | **Tight engines** — ostaju (već whitelisted po memo). Verifikovati cleanup. |
| `src/components/ZenMode.tsx`, `src/components/db/BlockingModal.tsx` | **Component-level** — migrirati na `taskScheduler.setInterval` + cleanup u `useEffect` return. |
| `src/features/docx-importer/docx-parser.ts` | Worker side — ostaje. |

### Plan

1. Migrirati 2 component-level callsitea (`ZenMode`, `BlockingModal`) na `taskScheduler`.
2. Za svaki "infra" callsite dodati eksplicitan `clearTimeout`/`clearInterval` u njegov cleanup/`beforeunload`/`shutdown` hook.
3. Suziti ESLint G7 whitelist na konkretne fajlove (ne folder-wide) i dokumentovati u komentaru.
4. Dodati test: `src/test/timer-discipline.test.ts` koji statički grepuje `setTimeout(` van whitelist-a → 0 hit-ova.

---

## PR-G5 (RC-5): Worker & cache disciplina

**Cilj:** Web Worker (`src/workers/analytics.worker.ts`) za rizik-zadržavanja se ne budi po svakom renderu/scroll-u/hover-u.

### Plan

1. **Dedupe ulaz:** `useAnalyticsWorker` već cancel-uje stale rezultat. Dodati **task-key dedupe** — identičan ključ (npr. `categoryId + cardCount + lastModified`) ne pokreće novi worker call ako prethodni još radi ili je svjež (<5s).
2. **Stabilizovati `deps` lances** u `useStatsData`/`usePlannerData`/`ResistanceTab`/`CognitiveAnalytics` — provjeriti da li se prosljeđuje novi `Array`/`Object` referenca svaki render (klasičan trigger). Koristiti `useMemo` na deps array prije nego ga proslijedimo workeru.
3. **Throttle/coalesce u `workerClient.ts`** — ako 3 hooka istovremeno traže "resistance over time" za isti `categoryId`, pošalji 1 poruku, podijeli rezultat (`Map<key, Promise>` cache sa TTL-om).
4. Telemetrija: privremeni `logger.debug` brojač u workeru (`postsThisSecond`) da verifikujemo smanjenje (cilj: ≤2/s u steady state).

---

## PR-G6 (RC-6): Render hot-paths (memo + virtualizacija)

### Mete

1. **`src/components/category/CardOrgMode.tsx`** (DnD u Organizatoru) — provjeriti da `SubcategoryRow` i `ChapterRow` imaju `React.memo` i stabilne callback ref-ove preko `useCallback`. DnD `useSensor` props moraju biti stable.
2. **`CardList`** — već virtualizovan (memo). Verifikovati `itemKey` pravilnost.
3. **`MnemonicWorkshop`** — već koristi `react-window` (potvrđeno). OK.
4. **`StrategicPlanner` / `MyStats`** — provjeriti da li skupe komponente (charts) imaju `React.memo` i da li im se `data` prop stabilizuje.
5. **`useCardOrgDnd.ts`** (102 LOC) — verifikovati da onDragEnd ne triggeruje cijeli re-render stabla; ako da, izolovati state u zustand selector ili `useSyncExternalStore`.

### Plan

- React Profiler pass (manual) na 3 mete (Organizator, Stats, Planner) → identifikovati top 3 re-render uzročnika → primijeniti `memo` + stable refs.
- Dodati `react-window` na `CardOrgMode` ChapterList ako broj kartica > 50 (treshold-based; ne mijenjaj UX za male skupove).

---

## PR-G7 (RC-7): Tooling guardrails (Meta-Fix)

**Stanje:** `tsconfig.app.json` već ima `"strict": true`, `"strictNullChecks": true`, `"useUnknownInCatchVariables": true`. **Ostaje uključiti:**

- `"noImplicitAny": true` (trenutno `false` — eksplicitan).
- `"noUnusedLocals": true`, `"noUnusedParameters": true` (trenutno `false`).
- `"noFallthroughCasesInSwitch": true` (trenutno `false`).
- `"exactOptionalPropertyTypes": true` (opciono — može da generiše plimu fix-ova; uključiti tek ako noImplicitAny prođe čisto).

### Plan

1. Uključiti `noImplicitAny` → pokrenuti `bunx tsc --noEmit` → fix-ovati sve hitove (vjerovatno <30, pošto zero-any policy već radi preko ESLint-a).
2. Uključiti `noUnusedLocals` + `noUnusedParameters` → očistiti dead imports/vars (whitelist `_` prefix već je default).
3. Uključiti `noFallthroughCasesInSwitch`.
4. ESLint: dodati pravila koja štite PR-G1..G6 invariants:
   - `react-hooks/exhaustive-deps` na `error` (ako nije već).
   - Custom no-restricted-syntax: ban `useEffect(..., [])` sa `cleanupRef.current = undefined` paterna bez `clearTimeout` (PR-G4 regression).
   - Ban `.catch(logger.error)` bez re-throw u `save*Settings` familiji (PR-G1 M2 regression guard) — implementirati kao restricted import ili lint message.

---

## PR-G8 (RC-8/9/10): Test flakes & cleanup

### Tri pod-zadatka

**1. RC-8 — Test flakes (tajmeri)**
- Identifikovati flaky testove preko `bunx vitest run --repeat=3` na sumnjivim fajlovima (`persist-queue-c3c4`, `task-scheduler`, `boot-deferred-cards`, `cards-mirror-and-rollback`).
- Migrirati svaki na `vi.useFakeTimers()` + `vi.runAllTimersAsync()` (već postoji `src/test/helpers/timers.ts` — koristiti).
- Cilj: 100 uzastopnih run-ova bez fail-a.

**2. RC-9 — Electron portovi**
- `electron/window.cjs` + `main.cjs`: verifikovati da dev port (5173) ima fallback i clean-shutdown handler.
- Dodati `app.on('before-quit')` koji čeka `taskScheduler.shutdown()` da završi (već postoji per memo).

**3. RC-10 — Dead code/biblioteke**
- `bunx knip` → izlistati nekorišćene exports/files/deps.
- Obrisati ono što je sigurno mrtvo (`src/lib/legacy/**` već u ignore — proceniti da li može u potpunosti out).
- Provjera `package.json` dep: `dexie` već uninstalled. Potencijalni kandidati: stari TipTap ext-ovi, neiskorišćeni Radix paketi.

---

## Tehnički detalji & invarijante (cross-PR)

- **Strict TypeScript** kroz sve PR-ove (`bunx tsc --noEmit` mora prolaziti na svaki commit).
- **Memo update** poslije svakog PR-a u `mem://features/data-integrity-v4` ili novi entry (npr. `mem://technical-choices/timer-discipline-pr-g4`).
- **Bez arhitekturnih promjena** — surgical fix-ovi, ne dirati TanStack SSOT, SQLite ACID, motion barrel, domain walls.
- **Bez novih dep-ova** — sve unutar postojećeg stacka.

---

## Redoslijed izvršavanja u ovom prolazu

1. **Sada (build mode):** Implementirati **PR-G3** kompletno (audit 4 tačke + fix samo realne curenja + 1-2 regression testa + memo).
2. **Stop & report** — sačekati `Implement plan` za PR-G4 da bismo kontrolisali domet svakog koraka.
