# Plan: Doradenje M3 / W1 / W5 (refinement)

Prihvataju se sve tri sugestije. Plan je inkrementalan iznad već završenog rada — bez ponavljanja postignutog.

---

## M3 — bez `flushSync`, eksplicitni `stash(cardId?)`

**Problem koji ostaje:** trenutni `useEditReturn` čita `cardId` ili iz prop-a (zamrznutog na trenutku rendera) ili iz globalnog SSOT mirror-a (`getCurrentEditingCardId()`). Oba puta su podložna race-u kad pozivalac `setEditingCardId(card.id)` pa odmah `stash()` u istom handleru: SSOT mirror radi (jer je sinhron), ali ostaje "magičan" — pozivalac ne vidi koji ID će biti spremljen. Korisnikova preporuka: neka pozivalac eksplicitno preda ID.

**Fix:**
1. `useEditReturn` → `stash` potpis postaje:
   ```ts
   stash: (cardIdOverride?: string | null) => void
   ```
   Prioritet rješavanja u stash-u (od najvišeg ka najnižem):
   1. `cardIdOverride` (eksplicitni argument)
   2. `opts.cardId` (vrijednost ili getter, kao danas)
   3. `getCurrentEditingCardId()` (SSOT fallback)

2. Pozivni siteovi (`SubjectCardsView`, `LearnPage`, `MainLayout`) prelaze na eksplicitni stil:
   ```ts
   const openEditor = (card) => {
     setEditingCardId(card.id);
     stashEditReturn(card.id);   // eksplicitno, bez oslanjanja na timing
     navigate("/edit");
   };
   ```

3. `flushSync` se **NE uvodi**. Brisati spomen iz starog plana.

4. `cardId` u `UseEditReturnOptions` ostaje (backwards-compat za pozive bez override-a), ali stabilizujemo getter referencu — interno normalizovati u `useMemo(() => typeof cardId === "function" ? cardId : () => cardId, [cardId])` da `useCallback(stash)` ne mijenja identitet kad consumer prosljeđuje inline funkciju. To eliminiše nepotrebne re-rendere child-a koji prima `stash` kao prop.

5. Test: postojeći `edit-return-stash.test.tsx` proširiti scenarijem
   - dva uzastopna `stash(cardA.id)`, `stash(cardB.id)` — rezultat snapshot ima `cardB.id`,
   - bez override-a, samo `setEditingCardId(x); stash();` — snapshot ima `x` (SSOT fallback i dalje radi).

---

## W1 — Inversion of Control za db→event-bus

**Trenutno stanje:** `db-schema.ts` direktno importuje `eventBus` iz `@/lib/event-bus`. Konstante su izdvojene u `event-bus-types.ts`, ali sama instanca i dalje stvara cycle (event-bus indirektno povlači storage modul koji ovisi o db-schema).

**Fix (DI, bez dinamičkih importa):**
1. `src/lib/db-schema.ts` više **ne** importuje `eventBus`. Umjesto toga drži lokalni emitter slot:
   ```ts
   type DbEmitter = (type: EventType, payload?: unknown) => void;
   let _emit: DbEmitter = () => {}; // no-op default (SSR/test bez busa)
   export function setDbEventEmitter(emit: DbEmitter): void { _emit = emit; }
   // unutar setDbErrorState / blocked / unblocked:
   _emit(EVENT_TYPES.DB_ERROR_CHANGED, next);
   _emit(EVENT_TYPES.DB_BLOCKED);
   _emit(EVENT_TYPES.DB_UNBLOCKED);
   ```
   Tip `EventType` se i dalje uzima iz `event-bus-types.ts` (bez instance).

2. Bootstrap fajl koji već podiže DB (najvjerovatnije `src/lib/db.ts` ili modul gdje se prvo zove `openDb`) uradi jedan put:
   ```ts
   import { eventBus } from "@/lib/event-bus";
   import { setDbEventEmitter } from "@/lib/db-schema";
   setDbEventEmitter((type, payload) => eventBus.emit(type, payload));
   ```
   Provjeriti i izvršiti istu DI registraciju u test setup-u (`src/test/setup.ts`) ako neki test direktno koristi `db-schema` emitere.

3. Posljedice:
   - cycle nestaje (graf: `event-bus` → ništa od db; `db-schema` → samo tipovi),
   - debag je trivijalan jer je emitter sinhron i pozvan pod imenom (`_emit`),
   - dinamički `import()` u `db-schema` se uklanja / ne uvodi.

4. Dodati mali test `src/test/db-emitter-di.test.ts`:
   - registrovati spy emitter, pozvati `setDbErrorState({...})` → spy primi `DB_ERROR_CHANGED` jednom,
   - ne registrovati emitter → `setDbErrorState` ne baca, no-op default radi.

---

## W5 — ESLint pravilo za `eventBus.emit`/`subscribe`

Prihvaćeno. Implementacija:

1. U `eslint.config.js` (flat config) dodati `no-restricted-syntax` pravilo za `src/**/*.{ts,tsx}` koje pogađa string-literal argumente:
   ```js
   {
     selector: "CallExpression[callee.object.name='eventBus'][callee.property.name=/^(emit|subscribe|unsubscribe)$/] > Literal:first-child",
     message: "Koristi EVENT_TYPES.X umjesto string literala (W5).",
   }
   ```
2. Skenirati postojeću bazu (`rg "eventBus\.(emit|subscribe|unsubscribe)\(['\"]" src`) i prebaciti sve hitove na konstantu (očekivano 0 — ali validirati).
3. Dokumentovati pravilo jednom rečenicom u memoriji `event-bus-architecture`.

---

## Tehnički detalji — fajlovi

```text
src/hooks/useEditReturn.ts            (M3 — stash(cardId?), stabilan getter)
src/views/SubjectCardsView.tsx        (M3 — stash(card.id))
src/views/LearnPage.tsx               (M3 — stash(card.id))
src/components/MainLayout.tsx         (M3 — stash(card.id))
src/lib/db-schema.ts                  (W1 — ukloniti import eventBus, dodati setDbEventEmitter)
src/lib/db.ts (ili bootstrap)         (W1 — DI registracija jednom)
src/test/setup.ts                     (W1 — DI u test env, ako treba)
eslint.config.js                      (W5 — no-restricted-syntax)
src/test/edit-return-stash.test.tsx   (M3 — proširiti)
src/test/db-emitter-di.test.ts        (W1 — novi)
```

## Šta se NE mijenja
- `flushSync` se ne uvodi nigdje.
- Dinamički `import()` za event-bus se ne uvodi.
- Postojeća SSOT mirror logika (`getCurrentEditingCardId`) ostaje kao fallback — pojas i tregeri.
