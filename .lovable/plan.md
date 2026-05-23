## Cilj

Riješiti tri preostala high-priority strukturna problema iz Greenfield audita:

1. **#2 Draft store** — konsolidovati posljednje ad-hoc draft implementacije na unificirani `useDraftAutosave` + `draftRegistry`.
2. **#7 Persist transactional unit** — eliminisati `sessionStorage["codex-flush-pending"]` hack i ukloniti rizik od *lost update* u `persist-queue`.
3. **#8 Završiti Zustand migraciju** — povući `cardMapRefFacade` iz public API-ja i ukinuti `cardMapRef` prop-drilling kroz contexte/hookove.

Svaki problem ide kao zaseban PR (PR-A, PR-B, PR-C) sa svojim test setom; nema cross-zavisnosti pa redoslijed može biti paralelan.

---

## PR-A — #2 Draft store (završetak konsolidacije)

**Trenutno stanje:** `useDraftAutosave` + `draftsTable` + `draftRegistry` postoje. `useCardDraftAutosave` je već migriran (PR6). Preostalo:

- `src/hooks/zettelkasten/useArticleDraft.ts` (173 LOC) — vlastiti debounce + setArticles flush.
- `src/hooks/card-actions/useSectionEditor.ts` (69 LOC) — lokalni dirty state.
- `src/hooks/useDirtyDialog.ts` — ne čita `draftRegistry`, oslanja se na ručni `isDirty` prop.

**Promjene:**

1. **`useArticleDraft.ts` → tanak adapter nad `useDraftAutosave`**
   - Ključ: `article:<articleId>`, `source: "članci"`.
   - Zadržati `flushNow()` semantiku (poziva se prije navigacije) — već je dio `useDraftAutosave.flush()`.
   - `persistDraft: true` → drop u `db.drafts` ako commit u `articles` tabelu padne.
   - Brisanje: rezultat brisanja članka uklanja `db.drafts` red preko `deleteDraft(key)`.

2. **`useSectionEditor.ts` → preusmjeriti dirty signal u `draftRegistry`**
   - Lokalni `useState<boolean>` ostaje za UI, ali `useEffect` mark/clean u `draftRegistry` sa ključem `card-section:<cardId>:<index>`.
   - Time sve "active dirty editor" instance žive u **jednom** registru → `useHasAnyDirty()` postaje jedini izvor istine za nav-guard.

3. **`useDirtyDialog.ts` — opcioni `draftKey` parametar**
   - Ako je proslijeđen, hook čita `useIsDirty(key)` iz `draftRegistry` umjesto eksternog booleana.
   - Postojeći potpis ostaje (`useDirtyDialog(isDirty, close)`) za backward-compat; novi overload `useDirtyDialog({ draftKey, close })`.

4. **`src/store/index.ts` — eksponovati draft API**
   - Re-export `useHasAnyDirty`, `useIsDirty`, `useDraftRegistry` kroz barrel da konzumeri ne idu po deep importima.
   - ESLint zid (`no-restricted-imports`) za `@/lib/drafts/*` izvan `src/lib/drafts/**` i `src/hooks/useDraft*` family.

5. **Testovi:**
   - `zettelkasten-article-draft.test.ts` se prepravlja na novi backend (fake-indexeddb, async load).
   - Novi `section-editor-dirty.test.ts` — provjera da mark/clean dolazi u registry.

**Rizik:** Async load draft-a u `useArticleDraft` mijenja inicijalni render (od sync na `useEffect`). Mitigacija: zadržati `setArticles` SSOT kao trenutni source-of-truth, draft je samo crash-recovery overlay → UI ne treba čekati IDB hop.

---

## PR-B — #7 Persist transactional unit

**Trenutno stanje (`src/lib/persist-queue.ts`, 236 LOC):**

- Coalescing `Map<id, Card>` + `Set<id>` deletes, jedan `setTimeout(flush, 16)`.
- Retry sa exp backoff (`MAX_RETRY=3`) → re-enqueue u `pendingPuts` nakon catch.
- `sessionStorage["codex-flush-pending"]` flag — meta-SSOT van memorije.
- `_mapVersion` cache za `mapToArray` — treći mirror.

**Glavni rizik:** Nakon `pendingPuts.clear()` + neuspješan `idbBulkApply`, novi write koji stigne tokom retry delay-a se mixa sa starim re-enqueue-om bez verzioniranja → **lost update** kad noviji ts upadne prije starijeg snapshot-a koji se vraća u red.

**Promjene:**

1. **Per-card monotone sequence broj**
   - U `enqueue({ type: "put", card })` dodijeli `seq = ++globalSeq` i čuvaj `Map<id, { card, seq }>`.
   - U retry re-enqueue putu, dodaj **samo ako** trenutni `pendingPuts.get(id)?.seq < failedSeq` (newer write win). Ako noviji već stigao, drop stari (no-op).

2. **In-flight set umjesto sessionStorage flag-a**
   - Drži `inFlight: Map<id, seq>` dok `idbBulkApply` traje.
   - `cleanup()` (page hide / beforeunload) `await`-uje da `inFlight` bude prazan.
   - Ukloniti **sve** `sessionStorage.{set,remove}Item("codex-flush-pending")` pozive. Memory pravilo "no LS/SS as SSOT" se vraća.
   - Crash-recovery signal se seli na `db.outbox` tabelu (vidi tačku 3).

3. **`db.outbox` tabela (Dexie v20)**
   - Schema: `outbox: "&seq, id, op, ts"`.
   - `enqueue` upiše outbox red u istoj IDB transakciji **prije** flush-a; flush briše red nakon uspjeha. Crash → boot recovery (`src/lib/drafts/draftRecovery.ts` susjed) re-aplicira preostale redove i toast-uje korisnika.
   - Time WAL semantika bez ručnog reseta.

4. **Granularan API**
   - Public surface ostaje `schedulePersist(action)` — interno se preslagiva. Ukloniti `bumpMapVersion` poziv iz svih konzumera: novi `mapToArray` se oslanja na referencu cardMap atoma (jedan SSOT, vidi PR-C).

5. **Toasts**
   - Dosadašnji "Pisanje nije uspjelo nakon više pokušaja" ostaje, ali se sad triggeruje samo ako outbox ostane neispražnjen.

6. **Testovi:**
   - `persist-queue-sequence.test.ts` — write A(seq=1) → flush fail → write A(seq=2) → re-enqueue A(seq=1) ne smije pregaziti seq=2.
   - `persist-queue-outbox.test.ts` — kill mid-flush, novi boot mora re-aplicirati.
   - `persist-queue.test.ts` (postojeći) ažurirati: dropom `sessionStorage` assertion-a.

**Rizik:** Dexie schema bump na v20. Mitigacija: outbox tabela je nova (nema migracije podataka); upgrade je čist `stores({ outbox: ... })`.

---

## PR-C — #8 Završetak Zustand migracije (ukinuti `cardMapRefFacade`)

**Trenutno stanje:** `cardMapStore` postoji kao atom, ali javni `cardMapRefFacade` se i dalje vuče kroz 6 fajlova kao da je `MutableRefObject<CardMap>`. Postoje i prop-drill `cardMapRef` parametri u `useCardCRUD`, `useCategoryManagement`, `useCardImport`, `useCardBootstrap`, `CardActionsProvider`, `CategoryActionsProvider`, `BackupActionsProvider`.

**Promjene:**

1. **`cardRepository.ts` — direktan store pristup**
   - Sve `cardMapRefFacade.current[id]` → `getCardMap()[id]`.
   - Mutacije i dalje idu kroz `setCardMap(prev => ...)` + `schedulePersist(...)`.

2. **Ukloniti `cardMapRef` prop iz API-ja hookova**
   - `useCardCRUD`, `useCategoryManagement`, `useCardImport`, `useCardBootstrap` — drop iz interface-a, koristi `getCardMap()` / `setCardMap()` interno.
   - `category-deletion-service.ts` — isto.

3. **Provider slojevi**
   - `CardStateProvider.tsx`: skinuti `cardMapRef` iz `CardStateInternalsContext`. Zadržati samo `useCardMap()` + `setCardMap` u publik surface-u.
   - `CardActionsProvider`, `CategoryActionsProvider`, `BackupActionsProvider`: prestati prosljeđivati `cardMapRef`.

4. **Public API barrel**
   - U `src/store/index.ts` ukloniti `cardMapRefFacade` i `CardMapRefFacade` export.
   - ESLint patch (`no-restricted-imports`): zabraniti import imena `cardMapRefFacade` čak i iz `@/store/useCardMapStore`.

5. **Bumpovi i čišćenje**
   - `bumpMapVersion()` postaje no-op nakon PR-B (jedan atom = jedan ref); ukloniti pozive iz `cardRepository`, `useCardCRUD`, `useCardImport`, `useCategoryManagement`. Funkcija ostaje export samo kao deprecated stub jedan PR (warn u DEV) i briše se u sljedećem.

6. **Testovi:**
   - `card-repository-delete.test.ts` ažurirati (drop `cardMapRefFacade` import; koristiti `getCardMap`).
   - Novi `store-facade-removed.test.ts` — gleda da javni barrel ne eksponira `cardMapRefFacade`.

**Rizik:** Najveći blast radius — 8 fajlova mijenja potpis. Mitigacija: transformacije su mehaničke (s/`cardMapRef.current`/`getCardMap()`/g + drop iz argumenata); 488-test svita pokriva regresiju.

---

## Tehnički sažetak (developer)

```text
PR-A draft konsolidacija
   useArticleDraft  ───▶  useDraftAutosave({ key, source:"članci", persistDraft:true })
   useSectionEditor ───▶  registry mark/clean
   useDirtyDialog   ───▶  overload sa draftKey
   barrel + ESLint zid za @/lib/drafts/*

PR-B persist transactional
   per-id seq + inFlight Map
   sessionStorage flag → DROP
   db.outbox (Dexie v20)  ───▶  boot recovery rerun
   bumpMapVersion → no-op (priprema za PR-C)

PR-C ukloniti cardMapRefFacade
   cardRepository → getCardMap()
   contexts/hooks drop cardMapRef prop (8 fajlova)
   barrel ne eksponira facade
   bumpMapVersion deprecated → noop
```

## Što plan **ne** dira

- Pomodoro, SpeedReader, notifikacije (timing-critical, ostaju raw).
- Editor caret race-ovi (#11), body-pointer-events-guard (#6), OLAP (#1), FSRS coupling (#5).
- Nijedna UI tema, ruta, ili user-facing semantika.
