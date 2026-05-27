# P2 PR-7f M3 — `mnemonic-storage.ts` decomposition (split-only, 0 behavior change)

## Goal

`src/features/mnemonic/mnemonic-storage.ts` (374 LOC) bundles 7 concerns: types, constants, a one-shot localStorage→IDB migration, Major System I/O, mnemonic cards repo + change-notifier, factory helpers, test-log I/O, stats, and content-analysis utilities. Split into a folder, barrel-exporting the identical public surface. Zero logic change, zero call-site change for the 14 importers.

## Target structure

```text
src/features/mnemonic/mnemonic-storage/
├── index.ts          # barrel — re-exports everything currently exported
├── types.ts          # MnemonicStatus, HookType, HookMode, MnemonicCard, MnemonicTestLogEntry
├── constants.ts      # DEFAULT_MAJOR_SYSTEM, JOKER_LOCATIONS, storage keys
├── migrate.ts        # migrateMnemonicsFromLocalStorageToIDB
├── major-system.ts   # loadMajorSystem, saveMajorSystem, resolveNumber
├── cards-repo.ts     # loadMnemonicCards, loadMnemonicCardsByCategory,
│                     # saveMnemonicCards, deleteMnemonicCard,
│                     # subscribeMnemonics (+ internal notifyMnemonics)
├── card-factory.ts   # detectHookType, createMnemonicCard, createMnemonicCardFromSelection
├── test-log.ts       # loadMnemonicTestLog, addMnemonicTestEntry
├── stats.ts          # getMnemonicStats
└── content-utils.ts  # extractNumbers, detectEnumerationItems
```

Old path `src/features/mnemonic/mnemonic-storage.ts` is deleted; folder `index.ts` claims the module specifier `@/features/mnemonic/mnemonic-storage`. All 14 importers keep their import lines unchanged.

## Internal wiring

- `card-factory.ts` imports `detectEnumerationItems` from `./content-utils` (currently a same-file call) and types from `./types`.
- `cards-repo.ts` owns the listener Set + `notifyMnemonics` (private). Public `subscribeMnemonics` lives here.
- `migrate.ts` imports `MNEMONIC_CARDS_KEY`/`MAJOR_SYSTEM_KEY`/`MNEMONIC_TEST_LOG_KEY` from `./constants` and `MnemonicCard` from `./types`.
- `major-system.ts` imports `DEFAULT_MAJOR_SYSTEM`, `JOKER_LOCATIONS` from `./constants`.
- All DB-touching files import `db` from `@/lib/db` and `logger` from `@/lib/logger` directly — no shared "infra" file needed.

No circular imports.

## Public API (unchanged)

Barrel re-exports the exact set already exported by the monolith:

```ts
export type { MnemonicStatus, HookType, HookMode, MnemonicCard, MnemonicTestLogEntry } from "./types";
export { DEFAULT_MAJOR_SYSTEM, JOKER_LOCATIONS } from "./constants";
export { migrateMnemonicsFromLocalStorageToIDB } from "./migrate";
export { loadMajorSystem, saveMajorSystem, resolveNumber } from "./major-system";
export {
  loadMnemonicCards, loadMnemonicCardsByCategory,
  saveMnemonicCards, deleteMnemonicCard, subscribeMnemonics,
} from "./cards-repo";
export { detectHookType, createMnemonicCard, createMnemonicCardFromSelection } from "./card-factory";
export { loadMnemonicTestLog, addMnemonicTestEntry } from "./test-log";
export { getMnemonicStats } from "./stats";
export { extractNumbers, detectEnumerationItems } from "./content-utils";
```

## Verification

1. `bunx tsc --noEmit` — 0 errors.
2. `rg "from ['\"]@/features/mnemonic/mnemonic-storage['\"]" src` — 14 hits, unchanged.
3. Smoke: existing mnemonic tests (if any) keep passing.

## Out of scope (deferred)

- Migrating `subscribeMnemonics` to TanStack Query invalidation bridge (next milestone).
- Removing the localStorage migration (one-shot, still needed for legacy installs).
- Re-architecting `detectHookType` / `detectEnumerationItems` (cosmetic refactor).
- Any change to DB schema, factory defaults, or stats math.

## Risks

- **Path ambiguity**: deleting the old `.ts` in the same patch as creating the folder avoids it.
- **Re-export drift**: barrel must mirror the current export set exactly; verified by importer-count grep above.

## LOC

- Removed: 1 file, 374 lines.
- Added: 10 files, ~395 lines (overhead = imports/exports + file headers, no logic added).
- Net diff: roughly +60/-50, well under the M3 budget.
