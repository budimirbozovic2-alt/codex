/**
 * Public API façade for the `mnemonic` domain.
 *
 * The mnemonic feature physically lives under `src/features/mnemonic/`
 * (UI + hooks + storage are coupled). This barrel exposes the storage +
 * domain-analytics surface that other domains/UI may consume, and is the
 * single sanctioned import path enforced by ESLint wall W13.
 *
 * Cross-domain rule: importers OUTSIDE `src/features/mnemonic/**` and
 * `src/domains/mnemonic/**` must use `@/domains/mnemonic` (or, for UI
 * embedding, `@/features/mnemonic` barrel). Deep imports are blocked.
 */
export type {
  MnemonicCard,
  MnemonicStatus,
  MnemonicTestLogEntry,
  HookType,
  HookMode,
} from "@/features/mnemonic";

export {
  loadMnemonicCards,
  loadMnemonicCardsByCategory,
  saveMnemonicCards,
  deleteMnemonicCard,
  getMnemonicStats,
} from "@/features/mnemonic";

// Domain analytics that WRITE to mnemonic storage live inside the domain.
// (Pure OLAP — `calcBlindSpots` — stays in `@/lib/analytics`.)
export { calcWeakHooks, type WeakHook } from "./analytics/weak-hooks";
