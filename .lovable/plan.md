
# Plan: Otklanjanje svih nalaza Deep Audit v1

Plan je organizovan u **5 faza**, redoslijedom: **brzi sigurnosni win-ovi → testovi → veliki refaktori → optimizacije → polish**. Svaka faza se može isporučiti i verifikovati nezavisno; nakon svake faze radimo manuelni QA boot + import + remap put.

---

## FAZA 1 — Quick Wins (kritični, mali zahvati)

Cilj: zatvoriti najopasnije rupe bez velikih refaktora.

1. **#2 Persist queue: `await flush()` na zatvaranju**
   - `src/lib/persist-queue.ts`: `cleanup()` → `async cleanup()` koji vraća `Promise<void>`; `flush()` se await-uje.
   - `src/main/electron-main.cjs` (preload bridge): u `app.on('before-quit')` šalje IPC `codex:flush-pending`, čeka renderer odgovor (max 3s timeout), pa quit-uje.
   - `src/preload.cjs`: izloži `window.electronAPI.onBeforeQuit(handler)`.
   - `src/hooks/useCards.ts`: u boot-u registruj handler koji zove `await persistQueue.cleanup()`.
   - Web fallback ostaje `visibilitychange` best-effort.

2. **#4 DB v15 — `chapterId` i kompozitni indeks**
   - `src/lib/db-schema.ts`: bump verziju na **v15**, dodaj `chapterId, [categoryId+chapterId], [subcategoryId+chapterId]` u `cards` store.
   - `db.version(15).stores({ cards: "...stari indeksi..., chapterId, [categoryId+chapterId], [subcategoryId+chapterId]" })` bez upgrade callback-a (Dexie sam reindeksira).
   - Provjeri da li mrtvi indeks `subcategory` (bez `Id`) postoji na liniji 152 — ako da, ukloni u istoj v15.
   - Ažuriraj `HealthMonitor`, `org-mode-utils`, `SessionFilters` da koriste `db.cards.where('[categoryId+chapterId]').equals([cid, chId])` umjesto `toArray().filter(...)`.

3. **#5 Konsolidacija dynamic importa u hot-pathu**
   - `src/hooks/useCardImport.ts`: ukloni 12× `await import("@/lib/db")`, pretvori u `import { db } from "@/lib/db"` na vrhu.
   - `src/lib/persist-queue.ts`: top-level `import { toast } from "sonner"`.
   - `src/hooks/useCards.ts:109`: isto ponašanje.
   - Zadrži `await import()` samo za `jszip`, `zip-service`, `mind-map-export`, AI gateway klijente.

4. **#4.6 `EMPTY_REVIEW_STATE` ispravka**
   - `src/contexts/AppContext.tsx:111`: zamijeni `{} as SRSettings` sa `DEFAULT_SR_SETTINGS` iz `spaced-repetition`.

**Verifikacija Faze 1:** boot test + kvota stres test (5k kartica) + Electron quit nakon edita → potvrda da pending writes nestaju.

---

## FAZA 2 — Test Coverage Foundation (kritično prije velikih refaktora)

Cilj: zaštititi taxonomy lanac prije Faze 3.

5. **#3 Unit testovi za migracije**
   - `src/lib/migrations/__tests__/heal-card-taxonomy.test.ts`
   - `src/lib/migrations/__tests__/resolve-legacy-taxonomy.test.ts` — uključuje 1.a/2.b/Glava X fixture.
   - `src/lib/migrations/__tests__/remap-from-backup.test.ts` — JSON backup → assert sve kartice imaju validne UUID-e.
   - Integracioni: `src/hooks/__tests__/useCardImport.integration.test.ts` — fake-IDB + legacy backup ulaz → assert clean state.
   - Vitest config provjera: fake-indexeddb je već u dev deps; ako ne — dodaj.

6. **Smoke testovi za core mutaciju**
   - `useCardCRUD` minimalni create/update/delete test sa mutex provjerom.
   - `event-bus` test multi-tab (BroadcastChannel mock).

**Cilj coverage-a:** 9 → ~35 testova, pokrivajući 100% migracionog koda.

---

## FAZA 3 — Veliki strukturni refaktori (kritično/visoko)

Cilj: ukloniti side-effect rizike koji se mogu maskirati u produkciji.

7. **#1 Premjestiti boot-time strukturne mutacije u eksplicitne migracije**
   - Nova: `src/lib/migrations/build-fallback-nodes.ts` — preuzima logiku sa `useCardBootstrap.ts:160–248`.
   - Nova: `src/lib/migrations/prune-phantom-nodes.ts` — preuzima destruktivnu logiku linije 213–234.
   - Migration runner: `src/lib/migrations/runner.ts` sa `migrationsApplied` set u IDB key-value (`meta` store), flag-ovi `fallback-nodes-v1`, `phantom-prune-v1`.
   - Tranzakciono: jedna `db.transaction('rw', categories, cards, meta, async () => {...})` po migraciji, sa rollback na throw.
   - `useCardBootstrap.ts` postaje **pure read** + jedan `await runner.runPending()` na startu.

8. **#6 Race condition u `useCards.ts` — Ref-Delta pattern striktno**
   - Refaktor 3 useEffect-a (`onCardLinksCleared`, `onCardReviewConfirmed`, `CARDS_UPDATED`) tako da svi koriste `setCards(prev => { const next = ...; cardMapRef.current = buildMap(next); return next; })`.
   - Eliminisati direktno čitanje `cardMapRef.current` izvan setState-a.
   - Dodati dev-only assertion da `cardMapRef.current.size === cards.length` nakon svakog set-a.

9. **#10 Split `AppContext.tsx` (496 LoC)**
   - `src/contexts/card-context.tsx`
   - `src/contexts/pomodoro-context.tsx`
   - `src/contexts/ui-context.tsx`
   - `src/contexts/notifications-context.tsx`
   - `src/contexts/AppProvider.tsx` — kompozicija; postojeći `AppContext.tsx` ostaje kao re-export shim za backward compat.
   - Bez API promjena prema consumer-ima.

**Verifikacija Faze 3:** ponovi cijeli QA put, posebno import legacy → boot → navigacija po chapter-u.

---

## FAZA 4 — Performance & Type Safety

10. **#7 ESLint `no-explicit-any: error`**
    - `eslint.config.js`: enable rule.
    - Cleanup 72 → ~10 fajlova:
      - `useCards.ts:39, 44`, `useCardBootstrap.ts:162, 172`, `useCardImport.ts`, `event-bus.ts:31` (generic `<TPayload>`), `category-service`, `mnemonic-storage`, `sources-storage`.
    - Preostali ~10 dobiju `// eslint-disable-next-line` sa komentarom-razlogom (samo dynamic JSON parsing iz nepoznatog backupa).

11. **#3.3 Event bus dev-mode warning**
    - `event-bus.ts`: `if (import.meta.env.DEV && set.size > 50) console.warn(...)` — leak detector.
    - `subscribe` vraća već postojeći unsubscribe; dodati `subscriberId` debug API.

12. **#3.5 `safeLocalStorage` wrapper**
    - `src/lib/safe-local-storage.ts`: `get<T>`, `set<T>`, `remove`, `getVersioned`, sa try/catch za quota i malformirani JSON.
    - Migrirati 59 mjesta kroz codemod (rg + sed) ili ručno po modulima.

13. **#4.3 Pomodoro drift-correcting timer**
    - Refaktor na `Date.now() - startedAt` model + `requestAnimationFrame`/`setTimeout` chain koji pauzira na `document.hidden`.

14. **#4.4 Notifications timer — tačan `setTimeout` do nextReminder**
    - Zamijeni `setInterval(60000)` sa preciznim `setTimeout(nextReminderAt - now)` koji se sam re-schedule-uje.

15. **#4.5 Shallow-equal selektor za `subcategories`**
    - `useCards.ts:34–49`: koristi `useMemo` sa custom equality preko stable JSON hash-a kategorija (već postoji `categoryRecords` version bump — koristi taj broj kao dep).

---

## FAZA 5 — Polish i Logger

16. **#9 Centralni Logger**
    - `src/lib/logger.ts`: `logger.debug/info/warn/error` sa nivoom iz settings + Electron file sink (renderer → IPC → main fs.appendFile).
    - Codemod ~70 `console.warn/error` poziva.

17. **#4.1 Split najvećih fajlova**
    - `lib/planner-storage.ts` (576) → `planner/state.ts`, `planner/persistence.ts`, `planner/derive.ts`.
    - `views/ZettelkastenView.tsx` (566) → ekstrakcija `useZettelkastenState`, `useZettelkastenActions`.
    - `lib/spaced-repetition.ts` (489) → `fsrs/algo.ts`, `fsrs/types.ts`, `fsrs/consts.ts`.
    - `useSourceReaderActions.ts` (499) — split na manje akcione module ako vrijeme dozvoli.

18. **Polish iz sekcije 🟢**
    - `useCardBootstrap.ts:43`: `initialLoadDone.current = true` premjesti na kraj `try` bloka.
    - `db-schema.ts:152`: ukloniti mrtav indeks `subcategory` (već u Fazi 1 #2).
    - `event-bus.ts:48`: HEARTBEAT/REPLY → debounce 250ms da bi izbjegao O(n²) na 10+ tabova.
    - `App.tsx`: ukloniti unutrašnji `<Suspense>` (samo external).
    - `seedDefaultCategories`: early-return ako `categories.count() > 0`.

---

## Tehnički detalji (referenca)

- **Migration runner shape:**
  ```ts
  // src/lib/migrations/runner.ts
  type Migration = { id: string; run: () => Promise<void> };
  const REGISTRY: Migration[] = [fallbackNodesV1, phantomPruneV1];
  export async function runPending() {
    const applied = new Set(await db.meta.get('migrationsApplied') ?? []);
    for (const m of REGISTRY) if (!applied.has(m.id)) {
      await db.transaction('rw', db.categories, db.cards, db.meta, async () => {
        await m.run(); applied.add(m.id);
        await db.meta.put([...applied], 'migrationsApplied');
      });
    }
  }
  ```

- **Electron beforeQuit bridge:**
  ```js
  // electron-main.cjs
  app.on('before-quit', async (e) => {
    if (flushed) return;
    e.preventDefault();
    win.webContents.send('codex:flush-pending');
    await once(ipcMain, 'codex:flush-done', { timeout: 3000 });
    flushed = true; app.quit();
  });
  ```

- **Cards indeks query primjer:**
  ```ts
  await db.cards.where('[categoryId+chapterId]').equals([cid, chId]).toArray();
  ```

---

## Procjena obima i redoslijed izvršenja

| Faza | Stavke | Veličina | Rizik regresije |
|---|---|---|---|
| 1 | #2, #4, #5, #4.6 | Mala–Srednja | Nizak |
| 2 | #3, smoke testovi | Srednja | Nema (samo testovi) |
| 3 | #1, #6, #10 | Velika | Visok — radimo nakon testova |
| 4 | #7, #3.3, #3.5, #4.3–4.5 | Srednja–Velika | Srednji |
| 5 | #9, #4.1, polish | Srednja | Nizak |

**Preporuka:** krenuti odmah Fazom 1 (1 implementacioni krug), zatim Fazom 2 (1 krug), pa odlučiti da li da nastavimo dalje ili pauziramo za QA.

---

## Šta očekujem od tebe

Potvrdi jednu od opcija:
- **(A)** Krenimo redom — Faza 1 prva.
- **(B)** Idemo samo Faze 1+2 sad, pa stop za pregled.
- **(C)** Preskoči Fazu 1 i kreni Fazom 2 (testovi prvi).
- **(D)** Sve faze odjednom u kontinuitetu (rizično bez međuverifikacije).
