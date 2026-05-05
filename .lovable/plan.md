# Plan: M3 + M4 + M5 + W1–W5

Cilj: ukloniti duplo stanje, popraviti curenja na HMR-u, smanjiti kaskadne re-rendere, i počistiti manje arhitekturne miris-e.

---

## M3 — `editingCardRef` duplikacija (SubjectCardsView, LearnPage, MainLayout)

**Problem:** `useUIContext()` već drži `editingCardId` kao SSOT, ali tri komponente paralelno održavaju lokalni `useRef<Card|null>(null)` samo da bi `useEditReturn({ cardId: () => ref.current?.id })` mogao očitati id. Pri brzoj navigaciji (esej → drugi esej → Esc) `stashEditReturn()` se može pozvati sa staljenim ref-om i prebrisati ispravan snapshot.

**Fix:**
1. Promijeniti `useEditReturn` opciju `cardId` da prima ili funkciju **ili** direktnu vrijednost (`string | null | (() => string | null)`); interno normalizovati na getter.
2. Uvesti tanki hook `useEditingCardId()` u `src/hooks/useEditingCardId.ts` koji vraća `editingCardId` iz UI konteksta (čisti facade, bez duplog state-a) — single source.
3. U `SubjectCardsView`, `LearnPage`, `MainLayout`: ukloniti `editingCardRef`. Umjesto `cardId: () => editingCardRef.current?.id` koristiti `cardId: editingCardId` (čita se iz UI konteksta).
4. U `openEditor(card)` callbackovima: redoslijed je `setEditingCardId(card.id)` → odmah `stashEditReturn()` (snapshot vidi novi id jer se prosljeđuje kao closure nad trenutnim renderom; ako je potreban sinhron pristup, koristiti `flushSync` oko `setEditingCardId` samo u tim mjestima).

**Test:** dodati `src/test/edit-return-stash.test.tsx` koji simulira dva uzastopna `openEditor` poziva i provjerava da `getEditReturn()` vraća snapshot za posljednju karticu.

---

## M4 — `persist-queue.ts` visibilitychange listener curi na HMR-u

**Problem:** Modul globalno radi `addEventListener("visibilitychange", _onVisibilityChange)`. Iako pre toga zove `removeEventListener`, kod HMR-a se modul re-evaluira sa **novom** referencom funkcije (closure nad novim `persistQueue`), pa stari listener iz prethodne verzije ostaje vezan na `document` (jer je `_onVisibilityChange` lexically nova vrijednost svaki put).

**Fix:**
1. Spremiti referencu na trenutni handler u `window.__codexPersistVisHandler` (single slot na window-u). Pri svakoj evaluaciji modula:
   - ako postoji prethodni handler → `removeEventListener`,
   - registrovati novi → upisati u slot.
2. Dodati `import.meta.hot?.dispose(() => { document.removeEventListener(...); flush(); })` na dnu modula da se garantuje cleanup.
3. Isto pravilo primijeniti i u `event-bus.ts` (vidi W3) za `beforeunload` slot na window-u.

---

## M5 — `DbErrorProvider` kaskadni re-renderi na uzastopne `DB_BLOCKED`

**Problem:** Svaki `DB_BLOCKED`/`DB_ERROR_CHANGED` emit-uje novi `DbErrorState` objekt; `setError(next)` ga uvijek upisuje, čak i kad je strukturalno identičan prethodnom (`type` + `message` isti), što rerenderuje sve `useDbError()` potrošače.

**Fix:**
1. U `DbErrorProvider` dodati shallow comparator: ako su `prev?.type === next?.type && prev?.message === next?.message`, vratiti `prev` iz `setError(prev => ...)`.
2. Isti comparator primijeniti i na inicijalni `getDbErrorState()` poziv u efektu.
3. Throttlovati `DB_BLOCKED` emit u `db-schema.ts`: pamtiti `lastBlockedAt`, ignorisati ponovljene emit-e u prozoru od 250 ms (debounce-by-edge), jer Dexie može više puta okinuti `blocked` u burst-u.

---

## W1 — Kružni importi

**Problem:** `db-schema.ts` ↔ `event-bus.ts` su na ivici ciklusa kroz `setDbErrorState` → `eventBus.emit`. Trenutno radi jer su izvozi top-level, ali ESM resolver ih označava kao circular u Vite logu.

**Fix:**
1. Izdvojiti event-bus tipove (`EVENT_TYPES`, `EventType`) u `src/lib/event-bus-types.ts` (čista konstanta, bez instance).
2. `db-schema.ts` i ostali emit-eri importuju samo iz `event-bus-types.ts` za konstante, a `eventBus` instancu lijeno (`import("@/lib/event-bus").then(m => m.eventBus.emit(...))`) ili kroz tanki `emit()` proxy modul.

---

## W2 — Brojanje listenera (event-bus dijagnostika)

**Fix:** dodati `eventBus.getListenerCount(type?: EventType): number` koji vraća veličinu Set-a (ili sumu za sve tipove). Iskoristiti u `HealthMonitor` panelu da prikaže aktivne pretplate; korisno za otkrivanje curenja u dev-u.

---

## W3 — Grubo HMR uništavanje event busa

**Problem:** `import.meta.hot.dispose(() => eventBus.destroy())` zatvara kanal i briše SVE listenere, ali novi modul kreira **novu** instancu, pa svi konzumeri koji su keširali staru referencu (npr. preko closure-a u running effect-ima koji još nisu ponovo montirani) ostaju visiti.

**Fix:**
1. Zadržati singleton: umjesto `new EventBus()` → `globalThis.__codexEventBus ??= new EventBus()`.
2. Na `dispose`: ne zvati `destroy()`, već samo `eventBus._softReset()` — clear listeners, zatvori i ponovo otvori `BroadcastChannel`, zadrži istu instancu.
3. `_softReset` čisti `listeners`, `activeTabs`, `heartbeatIntervalId`, i ponovo pokreće heartbeat.

---

## W4 — `useEffect` bez exhaustive-deps u `DbErrorProvider`

**Fix:** ukloniti `eslint-disable` linijuju, dodati `error` u deps i koristiti funkcionalni `setError(prev => ...)` da se izbjegne stale closure (uz M5 comparator).

---

## W5 — Inkonzistentno korišćenje `event-bus` konstanti

**Fix:** ESLint pravilo (lokalno, kroz `no-restricted-syntax`) koje zabranjuje string literal za `eventBus.emit("…")` / `subscribe("…")` — prisiljava na `EVENT_TYPES.X`. Skenirati postojeće pozive i konvertovati ako ima literal-a.

---

## Tehnički detalji — fajlovi koji se mijenjaju

```text
src/hooks/useEditReturn.ts            (M3 — `cardId` accept value or fn)
src/hooks/useEditingCardId.ts         (M3 — new tiny facade)
src/views/SubjectCardsView.tsx        (M3 — drop ref)
src/views/LearnPage.tsx               (M3 — drop ref)
src/components/MainLayout.tsx         (M3 — drop ref)
src/lib/persist-queue.ts              (M4 — window-slot handler + hot.dispose)
src/contexts/db/DbErrorProvider.tsx   (M5 + W4 — shallow compare + deps)
src/lib/db-schema.ts                  (M5 — debounce DB_BLOCKED emits)
src/lib/event-bus-types.ts            (W1 — extract constants)
src/lib/event-bus.ts                  (W1, W2, W3 — globalThis singleton, soft reset, listener counts)
src/components/HealthMonitor.tsx      (W2 — show listener counts; optional)
.eslintrc / eslint.config.js          (W5 — restrict literals)
src/test/edit-return-stash.test.tsx   (M3 regression test)
src/test/db-error-dedupe.test.tsx     (M5 regression test)
```

## Test plan

- M3: dva uzastopna `openEditor` → posljednji snapshot pobjeđuje.
- M4: simulirati HMR ručno (`document.dispatchEvent(new Event("visibilitychange"))` prije i poslije re-evaluacije persist-queue) — broj registrovanih handlera ≤ 1.
- M5: emitovati 5x identičan `DbErrorState` → `setError` se zove jednom (špijunski preko `useDbError` render countera).
- W3: dvije `import("@/lib/event-bus")` evaluacije vraćaju istu instancu (`globalThis` singleton).

Sve postojeće vitest testove pokrenuti na kraju (`bunx vitest run`).
