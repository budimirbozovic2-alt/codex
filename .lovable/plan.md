## Cilj

Centralizovati "tab/app je o tome da se ugasi" signale iza jednog renderer-side bridge-a koji bira najbolji dostupni izvor:

```
1. window.electronAPI.onBeforeQuit       (preferirano, future-proof)
2. window.electronAPI.onQuitBackupRequested + notifyQuitBackupDone (trenutni Electron kontrakt)
3. document.visibilitychange (state === "hidden")  (web/dev fallback)
```

Konzumenti (npr. `useCards`, `main.tsx` backup snapshot, budući moduli) registruju handler kroz jedinstveni API umjesto da svaki sam radi platform-detekciju i upravlja `notifyQuitBackupDone()` lock-om.

## Trenutno stanje (audit)

- `preload.cjs` izlaže `onQuitBackupRequested(cb)` + `notifyQuitBackupDone()` — **nema `onBeforeQuit`**. Ovaj zadatak ga uvodi kao **opcionalni** kanal (feature-detect), bez izmjena u main procesu sada.
- `src/lib/persist-queue.ts:108-119` već ima vlastiti `visibilitychange` listener — ostaje na mjestu kao safety net (ne dira se).
- `useCards.ts:51-71` i `main.tsx:157-178` direktno se kače na `onQuitBackupRequested` i ručno zovu `notifyQuitBackupDone()`. Bridge ih oslobađa toga, ali u ovom koraku bridge je **dodan kao novi modul** — refactor postojećih konzumenata nije u scope-u (može u sljedećem koraku, da ne miješamo bridge sa ponašajnim promjenama).

## Novi fajl: `src/lib/before-quit-bridge.ts`

Singleton modul, lazy `init()` na prvi `onBeforeQuit(handler)`. Karakteristike:

- **Feature detection redom**: `electronAPI.onBeforeQuit` → `electronAPI.onQuitBackupRequested` → `document.visibilitychange`. Bira **samo prvi dostupan**, da ne fire-a duplo.
- **Kod opcije 2** (`onQuitBackupRequested`) bridge automatski zove `notifyQuitBackupDone()` u `finally` nakon što se svi handler-i isettle-uju — main proces ne ostaje da čeka.
- **Serijalna izvršenja**: ako stigne novi quit signal dok je prethodni run aktivan, coalesce-uje se u jedan ponovni run nakon settle-a (`inFlight` + `queued` flagovi). Sprječava paralelne flush-eve.
- **Snapshot handler set** prije iteracije — handler koji se sam unregistruje tokom run-a ne razbija petlju.
- **`Promise.allSettled`** — jedan handler koji throw-a ne blokira ostale.
- **Browser fallback** koristi `visibilitychange` umjesto `beforeunload` (pouzdaniji u modernim browser-ima, posebno na mobile-u; `beforeunload` se često ne fire-a). Fire-and-forget jer tab može da nestane prije nego promise resolve-uje.

### Javni API

```ts
export function onBeforeQuit(handler: () => void | Promise<void>): () => void;
export function triggerBeforeQuit(): Promise<void>;        // za testove i imperativni "Restart"
export function _resetBeforeQuitBridge(): void;            // test/HMR helper
```

## Type update: `src/types/electron.d.ts`

Dodati **opcionalno** polje da feature-detect prođe TS checker:

```ts
/** Future-proof channel — preferred over onQuitBackupRequested when available. */
onBeforeQuit?: (callback: () => void | Promise<void>) => () => void;
```

`preload.cjs` ostaje nepromijenjen — `onBeforeQuit` je `undefined` u runtime-u, bridge automatski pada na opciju 2.

## Out of scope (eksplicitno)

- Refactor `useCards.ts` i `main.tsx` da koriste bridge — odvojen, ponašajni PR.
- Uklanjanje `visibilitychange` listenera u `persist-queue.ts` — ostaje kao defense-in-depth.
- Bilo kakva izmjena `electron/backup.cjs` ili `preload.cjs` (main proces).
- Implementacija stvarnog `onBeforeQuit` IPC kanala u main procesu.

## Fajlovi

- **Novi**: `src/lib/before-quit-bridge.ts`
- **Izmjena**: `src/types/electron.d.ts` (dodati opcionalni `onBeforeQuit`)
