## O-1 — Centralizovani SQLite Boot FSM (`useSqliteReady()`)

### Cilj
Eliminisati implicitni polling/lazy-init obrazac gdje **svaki** repozitorij i query-modul samostalno poziva `getOpfsSqliteExecutor()` i tako trigger-uje (ili čeka) inicijalizaciju. Umjesto toga: **jedna** centralna FSM-a vlasništvuje životni ciklus executor-a, a UI/hookovi konzumiraju stanje kroz `useSqliteReady()`.

### Trenutno stanje (problem)
- `src/lib/persistence/sqlite/client.ts` drži `_executorPromise` modul-singleton sa internim retry petljom (3× × 500ms).
- 20+ pozivnih mjesta (`src/lib/db/queries/*`, `src/lib/repositories/*`, `bootDb.ts`, `runSchema.ts`, `import-transaction.ts`, ...) poziva `await getOpfsSqliteExecutor()` na svakom write/read pozivu → svaki novi konzument implicitno trigger-uje init i čeka cold WASM.
- Nema centralnog `ready/error/degraded` stanja koje UI može observirati bez React Query "magije". `bootDb.ts` već radi pre-warm, ali to je side-channel, ne autoritativan signal.
- Postoji `bootStateMachine.ts` ali on opisuje **boot orchestrator** faze (opening/schema/loading/ready), ne specifično stanje SQLite executor-a.

### Ciljna arhitektura

```text
                ┌─────────────────────────┐
                │   sqliteReadyMachine    │  (modul-level signal)
                │   idle → opening →      │
                │   ready | degraded |    │
                │   fatal                 │
                └───────────┬─────────────┘
                            │ subscribe
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   useSqliteReady()   ensureSqliteReady()  getExecutorOrThrow()
   (React hook)       (async gate, idemp.) (sync, throws if !ready)
        │                   │                   │
        ▼                   ▼                   ▼
   UI gate-ovi         bootDb, migracije    queries/* + repos/*
```

### Plan koraka (mali, vertikalan)

1. **Novi modul** `src/lib/persistence/sqlite/readyMachine.ts`:
   - `type SqliteReadyState = { type: "idle" } | { type: "opening" } | { type: "ready"; executor } | { type: "degraded"; executor; reason } | { type: "fatal"; error }`
   - `getSqliteReadyState()`, `subscribeSqliteReady(listener)` — zero-React modul signal (isti obrazac kao `bootStateMachine`).
   - `ensureSqliteReady(): Promise<SqlExecutor>` — idempotentno; prvi poziv vrti retry-loop koji je sada **u FSM-i**, ne u `client.ts`; emituje `opening → ready|degraded|fatal`.
   - `getExecutorOrThrow(): SqlExecutor` — sinhroni accessor za hot-path-ove poslije ready-a.

2. **Tanak `client.ts`**:
   - `getOpfsSqliteExecutor()` postaje **delegacija** na `ensureSqliteReady()`.
   - Sav retry/dev-fallback/degraded-emit logika seli u `readyMachine.ts`.
   - `__resetSqliteClient()` reset-uje FSM.

3. **React hook** `src/hooks/useSqliteReady.ts`:
   - `useSyncExternalStore(subscribeSqliteReady, getSqliteReadyState)` — isti obrazac kao `useBootState`.
   - Vraća discriminated union za UI gate-ove.

4. **Bridge ka `db-degraded` event-u**:
   - FSM interno dispatch-uje postojeći `db-degraded` CustomEvent kad uđe u `degraded` stanje, da `DbDegradedWatcher` ne mora da se mijenja.

5. **Pozivni sajtovi**: **NE** mijenjamo 20+ poziva na `getOpfsSqliteExecutor()`. Oni i dalje rade — `getOpfsSqliteExecutor()` je sada tanak delegate. Time čuvamo skop O-1 i izbjegavamo veliki rewrite.

6. **`bootDb.ts` pre-warm**: zamijenjen sa `await ensureSqliteReady()` (semantički isto, čitljivije).

7. **Testovi**:
   - `src/test/sqlite-ready-machine.test.ts` — opening → ready, opening → degraded (dev-fallback), opening → fatal (PROD Electron).
   - Ažurirati `__resetSqliteClient` korisnike (`sqlite-harness.ts`, `setup.ts`) da resetuju i FSM.

### Tehnički detalji

- FSM se ponaša **isto** kao trenutni `client.ts` — sva opažena ponašanja (3 retry-a, dev-fallback emit, PROD hard-fail, `db-degraded` events) ostaju identična.
- Razlika: stanje je sada **observabilno** (React + non-React), umjesto da se izvodi iz prisustva promise-a.
- `keyedMutex` / `cardCommandBus` se **ne diraju** (memo: deprecated za DB, ali nije skop O-1).
- Tip `SqlExecutor` je već exportovan iz `./executor` — nema novih tipova ka konzumentima.

### Fajlovi koje mijenjamo
- **Novo**: `src/lib/persistence/sqlite/readyMachine.ts`, `src/hooks/useSqliteReady.ts`, `src/test/sqlite-ready-machine.test.ts`
- **Edit**: `src/lib/persistence/sqlite/client.ts` (delegacija), `src/hooks/card-bootstrap/bootDb.ts` (koristi `ensureSqliteReady`).

### Van skopa O-1 (nastavak u drugim koracima)
- Migracija 20+ poziva sa `getOpfsSqliteExecutor()` na `getExecutorOrThrow()` (čisto sinhrono) — to je O-? cleanup.
- UI gate u `App.tsx` na `useSqliteReady()` — opcionalno.