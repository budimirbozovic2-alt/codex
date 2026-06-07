## Dijagnoza

**Zaključak:** najvjerovatniji root cause nije React render sam po sebi, nego `getOpfsSqliteExecutor()` koji može ostati trajno pending zbog Worker RPC-a bez timeout/error-propagacije. React zatim ostaje iza splash/boot gate-a dok se ne aktivira panic/fallback, a Electron native splash se skida tek na `renderer-ready` signalu iz `useCardBootstrap`.

```
main.tsx
  -> createRoot(<App />)
    -> AppProvider
      -> AppBootstrap
        -> useCardBootstrap
          -> bootDb
            -> getOpfsSqliteExecutor
              -> initWorkerExecutor
                -> rpc({ op: "init" })
                  -> opfs-worker initDb / sqlite wasm / OPFS
```

## 1. Boot sekvenca i tačka blokade

### P0 — `getOpfsSqliteExecutor()` može čekati zauvijek

**Fajl:** `src/lib/persistence/sqlite/client.ts:49-136`  
**Fajl:** `src/lib/persistence/sqlite/worker-client.ts:53-63`

`getOpfsSqliteExecutor()` memoizuje `_executorPromise` i unutar nje čeka:

```ts
const result = await initWorkerExecutor();
```

`initWorkerExecutor()` je samo:

```ts
return rpc<WorkerInitResult>({ op: "init" });
```

A `rpc()` kreira Promise bez timeouta:

```ts
pending.set(id, { resolve, reject });
w.postMessage({ id, ...payload });
```

Ako Worker umre prije slanja odgovora, ovaj Promise se nikad ne resolve/reject-uje. To blokira:

- `bootDb()` (`src/hooks/card-bootstrap/bootDb.ts:31-38`)
- `runSchema()` preflight i migraciju (`src/hooks/card-bootstrap/runSchema.ts:31-42`, `72-82`)
- `loadInitialData()` preko repozitorijuma (`src/hooks/card-bootstrap/loadInitialData.ts:46-50`)

**Efekat:** `useCardBootstrap` ne dolazi do `finally` bloka (`src/hooks/useCardBootstrap.ts:175-190`), pa se ne poziva `cleanupSplash()` i `notifyElectronReady()` dok ne opali 22s panic timer.

### P0 — Worker crash se samo loguje, ne odbija pending RPC

**Fajl:** `src/lib/persistence/sqlite/worker-client.ts:44-49`

Trenutni handler:

```ts
worker.addEventListener("error", (e: ErrorEvent) => {
  logger.error("[opfs-worker] error event", e.message || e);
});
```

Problem: `pending` mapa ostaje puna, a svaki `rpc()` koji čeka odgovor ostaje trajno pending.

**Popravka:** worker `error` i `messageerror` moraju reject-ovati sve pending RPC-je, terminate-ovati worker i resetovati singleton.

```ts
function rejectAllPending(error: Error): void {
  for (const [, p] of pending) p.reject(error);
  pending.clear();
}

worker.addEventListener("error", (e) => {
  const err = new Error(e.message || "OPFS worker crashed");
  logger.error("[opfs-worker] error event", err);
  rejectAllPending(err);
  worker?.terminate();
  worker = null;
});

worker.addEventListener("messageerror", () => {
  const err = new Error("OPFS worker message serialization failed");
  rejectAllPending(err);
  worker?.terminate();
  worker = null;
});
```

## 2. Worker / OPFS komunikacija

### P0 — RPC nema deadline

**Fajl:** `src/lib/persistence/sqlite/worker-client.ts:53-63`

Čak i ako Worker ne crashuje nego se zaglavi u `sqlite3InitModule()`, `installOpfsSAHPoolVfs()` ili migracijama, renderer nema način da prekine čekanje.

**Popravka:** svaki RPC, posebno `init`, treba imati timeout.

```ts
function rpc<T>(payload: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
  const w = getWorker();
  const id = ++msgId;

  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error(`OPFS worker RPC timeout: ${String(payload.op)}`));
    }, timeoutMs);

    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value as T); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    try {
      w.postMessage({ id, ...payload });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
```

### P0 — SQLite SAH-pool cache čini trenutni retry skoro beskorisnim

**Fajl:** `src/lib/persistence/sqlite/client.ts:67-111`  
**Fajl:** `src/lib/persistence/sqlite/opfs-worker.ts:163-172`  
**Bibliotečki signal:** `@sqlite.org/sqlite-wasm` memoizuje rezultat `installOpfsSAHPoolVfs()` po VFS imenu; dokumentacija navodi `forceReinitIfPreviouslyFailed` kao eksplicitni override za prethodni neuspjeh.

Trenutno se 5 retry pokušaja u `client.ts` vrte nad istim Workerom i istim VFS imenom:

```ts
await sqlite3.installOpfsSAHPoolVfs({ name: "codex-opfs-pool" });
```

Ako prvi pokušaj padne sa `Missing required OPFS APIs` ili transient greškom, biblioteka može vratiti isti cached failure na narednim pokušajima. Dakle, retry ne restartuje realni OPFS init.

**Popravka:** ili ukloniti renderer retry i pustiti Worker da odluči, ili u Workeru koristiti:

```ts
await sqlite3.installOpfsSAHPoolVfs({
  name: "codex-opfs-pool",
  forceReinitIfPreviouslyFailed: true,
});
```

uz strogo ograničen broj pokušaja i dijagnostiku.

### P1 — Mogući asset/path problem za `sqlite3-opfs-async-proxy.js`

**Fajl:** `vite.config.ts:19-24` kopira fajl u `dist/sqlite`  
**Fajl:** `src/lib/persistence/sqlite/opfs-worker.ts:151-158` koristi `locateFile` relativno na `sqliteWasmUrl`

`locateFile()` pomaže za `sqlite3.wasm`, ali SQLite paket za OPFS async proxy interno koristi `new URL("sqlite3-opfs-async-proxy.js", import.meta.url)` u svom bundlovanom modulu. To može tražiti proxy pored Vite-bundlovanog chunk-a, a ne nužno u `/sqlite` direktorijumu.

**Rizik:** u packaged Electron buildu Worker može pasti jer proxy script nije na očekivanoj hashed/chunk putanji, a zbog P0 pending RPC ne bude reject-ovan.

**Popravka:** verifikovati emitovani `dist/assets/*` worker chunk i natjerati bundler da asset bude dostupan na istoj putanji koju koristi SQLite modul; ili koristiti SQLite worker1 build prema preporučenom upstream obrascu, ili patchovati/konfigurisati public path tako da `sqlite3-opfs-async-proxy.js` bude dostupan pored finalnog module URL-a koji ga učitava.

## 3. Arhitektonske greške u polling rješenju

### P1 — Repozitorijumski polling je logički mrtav

**Fajlovi:**

- `src/lib/db/queries/cards.ts:34-42`
- `src/lib/db/queries/categories.ts:33-41`
- `src/lib/db/queries/settings.ts:29-37`
- `src/lib/db/queries/sources.ts:32-40`
- isti obrazac u `planner`, `mnemonics`, `mind-maps`, `logs`, `drafts`, `knowledge-base`, `major-system`, `mnemonic-test-log`

Obrazac:

```ts
let exec = await getOpfsSqliteExecutor();
let retries = 30;

while (!exec && retries > 0) {
  await new Promise((res) => setTimeout(res, 100));
  exec = await getOpfsSqliteExecutor();
  retries--;
}
```

`getOpfsSqliteExecutor()` po tipu nikad ne vraća `null`; vraća `SqlExecutor` ili baca/rejectuje. Znači `while (!exec)` praktično nikad nije aktivan. Ako prvi `await` visi, polling nikad ni ne počinje.

**Zaključak:** ovo ne rješava race condition. Samo maskira tip sistema.

**Popravka:** ukinuti per-repository polling i uvesti centralni boot-ready/executor manager.

### P1 — Polling ne blokira main thread, ali blokira boot DAG asinhrono

`await new Promise(setTimeout)` ne blokira JS thread; Worker može odgovoriti. Problem nije CPU deadlock, nego promise-lifecycle deadlock:

- renderer čeka `rpc()` bez timeouta
- Worker crash/parse/CSP/asset error ne šalje odgovor
- `pending` se ne rejectuje
- `_executorPromise` ostaje pending
- svi repozitorijumi čekaju isti pending singleton

### P1 — `runInTransaction()` zaobilazi Worker transaction protokol

**Fajl:** `src/lib/persistence/sqlite/client.ts:142-158`  
**Fajl:** `src/lib/persistence/sqlite/worker-client.ts:84-102`

`worker-client` ima pravilnu `transaction(fn)` implementaciju sa `begin/commit/rollback` RPC i `txId` lockom. Ali `runInTransaction()` ručno radi:

```ts
await executor.exec("BEGIN IMMEDIATE;");
const result = await cb(executor);
await executor.exec("COMMIT;");
```

Ovi `exec()` pozivi idu bez `txId`, pa Worker queue ne zna da je transakcija aktivna. Drugi RPC-jevi mogu se ubaciti između BEGIN i COMMIT.

**Popravka:**

```ts
export async function runInTransaction<T>(cb: (executor: SqlExecutor) => Promise<T>): Promise<T> {
  const executor = await getOpfsSqliteExecutor();
  return executor.transaction(cb);
}
```

## 4. Step-by-step akcioni plan

### Kritično 1 — Napraviti centralni SQLite boot manager

**Fajl:** novi ili postojeći `src/lib/persistence/sqlite/client.ts`

Cilj: jedan eksplicitan lifecycle: `idle -> starting -> ready | degraded | failed`. Repozitorijumi ne smiju sami pollingovati.

Predloženi API:

```ts
type SqliteBootState =
  | { status: "idle" }
  | { status: "starting"; promise: Promise<SqlExecutor> }
  | { status: "ready"; executor: SqlExecutor; opfsMode: boolean }
  | { status: "failed"; error: Error; diag?: unknown };

export function startSqliteBoot(): Promise<SqlExecutor>;
export function getSqliteBootSnapshot(): SqliteBootState;
export function subscribeSqliteBoot(listener: () => void): () => void;
export async function requireSqliteExecutor(): Promise<SqlExecutor>;
```

### Kritično 2 — Worker RPC mora imati timeout i crash propagation

**Fajl:** `src/lib/persistence/sqlite/worker-client.ts:30-68`

- dodati `rejectAllPending()`
- dodati timeout u `rpc()`
- resetovati `worker = null` na crash
- opcionalno dodati `op: "ping"` za health-check

### Kritično 3 — Ukloniti fallback split-brain iz produkcionog toka

**Fajl:** `src/lib/persistence/sqlite/client.ts:113-129`

Trenutno Electron PROD nakon 5 neuspjeha vraća `getDevFallbackExecutor()`. To znači aplikacija može izgledati pokrenuto, ali bez podataka i bez trajnosti.

**Bolji produkcioni obrazac:**

- DEV browser: in-memory fallback dozvoljen
- Electron PROD: ako OPFS ne radi, prikazati Recovery UI / degraded screen, ne otvarati tihu in-memory bazu

```ts
if (isElectronRuntime() && import.meta.env.PROD) {
  emitDegraded("opfs-runtime-error", diag);
  throw new Error("Persistent SQLite OPFS failed to initialize");
}
```

### Kritično 4 — `useCardBootstrap` treba čekati centralni boot state, ne repozitorijumski polling

**Fajl:** `src/hooks/useCardBootstrap.ts:89-99`

Predloženi pattern:

```ts
useEffect(() => {
  const abort = new AbortController();

  void (async () => {
    try {
      transition({ type: "OPEN_START" });
      await startSqliteBoot({ signal: abort.signal });
      transition({ type: "OPEN_OK" });
      await runSchema();
      const data = await loadInitialData();
      // hydrate stores
      transition({ type: "READY" });
    } catch (err) {
      transition({ type: "SCHEMA_FAIL", cause: "unknown", message: String(err) });
    } finally {
      setReady(true);
      cleanupSplash();
      notifyElectronReady();
    }
  })();

  return () => abort.abort();
}, []);
```

### Srednje 1 — Ukloniti `while (!exec)` iz svih query fajlova

**Fajlovi:** svi `src/lib/db/queries/*.ts` sa `let exec = await getOpfsSqliteExecutor()` i `while (!exec)`.

Zamjena:

```ts
const exec = await requireSqliteExecutor();
```

Ako UI treba čekanje, to se radi u boot provideru ili TanStack Query `enabled`, ne u repozitorijumu.

### Srednje 2 — Popraviti `runInTransaction()`

**Fajl:** `src/lib/persistence/sqlite/client.ts:142-158`

Zamijeniti ručni `BEGIN/COMMIT` sa `executor.transaction(cb)`.

### Srednje 3 — Worker queue mora otključavati i na commit grešci

**Fajl:** `src/lib/persistence/sqlite/opfs-worker.ts:281-303`

Ako `COMMIT` baci, trenutno se `currentTxId` ne mora očistiti. To može parkirati queue.

Pattern:

```ts
case "commit":
  schedule(msg.txId, async () => {
    try {
      execScript("COMMIT");
      reply({ id: msg.id, ok: true });
    } catch (e) {
      reply({ id: msg.id, ok: false, error: message(e) });
    } finally {
      if (currentTxId === msg.txId) currentTxId = null;
      void pump();
    }
  });
```

### Srednje 4 — `sqlite-init.ts` ne smije memoizovati rejected WASM import

**Fajl:** `src/lib/persistence/sqlite/sqlite-init.ts:29-37`

```ts
_modPromise = import("@sqlite.org/sqlite-wasm")
  .then((m) => ...)
  .catch((err) => {
    _modPromise = null;
    throw err;
  });
```

### Nisko — Poboljšati observability boot-a

Dodati strukturisane markere:

- `sqlite:worker-created`
- `sqlite:worker-init-rpc-sent`
- `sqlite:wasm-init-start/done`
- `sqlite:opfs-install-start/done/fail`
- `sqlite:migrations-start/done`
- `sqlite:worker-rpc-timeout`
- `sqlite:worker-crash-pending-count`

## Najbolji React pattern

Ne koristiti Suspense za SQLite executor dok ne postoji stabilan resource wrapper. Trenutno je sigurniji pattern:

1. `AppBootstrap` startuje SQLite boot u `useEffect`.
2. Centralni external store drži boot stanje.
3. Root UI renderuje:
   - splash/loading dok je `starting`
   - recovery screen dok je `failed`
   - aplikaciju dok je `ready`
4. TanStack Query pozivi imaju `enabled: boot.status === "ready"`.
5. Repozitorijumi pretpostavljaju da je executor spreman; ako nije, bacaju jasnu grešku, ne polling.

## Prioritetni minimalni rez

Ako želiš najkraći hirurški fix bez velikog refaktora:

1. `worker-client.ts`: reject pending RPC na `error/messageerror` + RPC timeout.
2. `client.ts`: Electron PROD ne smije pasti na in-memory fallback; mora baciti kontrolisanu boot grešku.
3. `client.ts`: `runInTransaction()` delegirati na `executor.transaction()`.
4. `opfs-worker.ts`: `commit/rollback` moraju čistiti `currentTxId` u `finally`.
5. `db/queries/*`: ukloniti mrtvi `while (!exec)` pattern.

Ovo direktno deblokira splash freeze jer svaki Worker failure postaje finite error path umjesto trajno pending Promise-a.