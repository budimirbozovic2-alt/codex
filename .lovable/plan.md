# P3 — Polish

Tri male, nezavisne čistke. Sve mogu ići u jednom commit-u; nijedna ne mijenja runtime ponašanje.

## Korak 1 — Centralizovati session-key brisanje (`useCardImport.ts`)

**Trenutno:** `src/hooks/useCardImport.ts:150` direktno zove `localStorage.removeItem("sr-review-session")` sa try/catch. String literal je takođe duplikat — `src/components/ReviewSession.tsx:11` definiše `const SESSION_KEY = "sr-review-session"`.

**Plan:**
1. U `src/lib/review-session-storage.ts` (novi mali modul) izvući:
   ```ts
   export const REVIEW_SESSION_KEY = "sr-review-session";
   export function clearReviewSession(): void {
     try { localStorage.removeItem(REVIEW_SESSION_KEY); } catch { /* disabled */ }
   }
   ```
2. `ReviewSession.tsx` importuje `REVIEW_SESSION_KEY` umjesto lokalne kopije.
3. `useCardImport.ts:150` zamijeniti sa `clearReviewSession()`.

**Acceptance:** 0 hard-coded `"sr-review-session"` literala van novog modula; postojeći test suite zelen.

## Korak 2 — Komentar uz `installBodyPointerEventsGuard` (`App.tsx`)

**Trenutno:** `src/App.tsx:53`
```ts
useEffect(() => installBodyPointerEventsGuard(), []);
```
Funkcionalno tačno (vraća dispose), ali bez objašnjenja — pri budućoj refaktorizaciji neko može omaškom razdvojiti install/cleanup ili dodati drugi side-effect u isti useEffect.

**Plan:** dodati explicit blok-komentar i izričito vratiti dispose:
```ts
// Install global guard for Radix Dialog `pointer-events: none` leak.
// IMPORTANT: returned dispose MUST be wired into useEffect cleanup —
// StrictMode double-invoke and HMR rely on it to avoid duplicate listeners.
// Do not collapse this into another effect; keep install/dispose 1:1.
useEffect(() => {
  const dispose = installBodyPointerEventsGuard();
  return dispose;
}, []);
```

**Acceptance:** runtime nepromijenjen; namjera čitljiva u review-u.

## Korak 3 — `Symbol.for` ključevi za event-bus singleton (`event-bus.ts`)

**Trenutno:** `src/lib/event-bus.ts` koristi imenovane stringove `globalThis.__codexEventBus` i `globalThis.__codexTabId`. Drugi moduli/biblioteke koje slučajno koriste isti naming pattern mogu kolidirati u istom realm-u.

**Plan:**
1. Zamijeniti string-named globals sa `Symbol.for()` registry-keyed slotovima:
   ```ts
   const BUS_KEY = Symbol.for("codex.eventbus");
   const TAB_KEY = Symbol.for("codex.tabId");

   type GlobalSlots = {
     [BUS_KEY]?: EventBus;
     [TAB_KEY]?: string;
   };
   const slots = globalThis as typeof globalThis & GlobalSlots;
   ```
2. `var __codexEventBus` / `var __codexTabId` declare-globalThis blok obrisati.
3. HMR singleton i TAB_ID inicijalizacija čitaju/pišu kroz `slots[BUS_KEY]` / `slots[TAB_KEY]`.
4. `Symbol.for` registry je svjesno globalan po realm-u (ista garancija kao prije za HMR), ali key prostor je odvojen od string properties.

**Acceptance:** event-bus singleton i dalje preživljava HMR (`_softReset` putanja ostaje); 0 referenci na `__codexEventBus` / `__codexTabId` string identifikatore u `src/`; postojeći testovi zeleni (`db-emitter-di.test.ts`, integracioni backlink test koji koristi event-bus).

## Tehnički sažetak

| Korak | Fajlovi | Dodaje | Briše |
|---|---|---|---|
| 1 | new `lib/review-session-storage.ts`, `useCardImport.ts`, `ReviewSession.tsx` | 1 helper modul | 1 hard-coded literal + ad-hoc try/catch |
| 2 | `App.tsx` | 4-redni komentar + eksplicitna dispose return | — |
| 3 | `event-bus.ts` | 2 `Symbol.for` slot-a | `declare global var` blok |

**Out of scope:** P0/P1/P2 stavke; bilo kakva promjena event-bus runtime semantike (kanal, listeneri, soft-reset); refactor `body-pointer-events-guard` interne logike.

**Predloženi redoslijed:** 1 → 2 → 3 (svi su L-risk, neovisni; redoslijed nebitan).