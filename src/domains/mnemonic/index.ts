/**
 * Public API façade for the `mnemonic` domain.
 *
 * Cross-domain rule: importers OUTSIDE `src/features/mnemonic/**` and
 * `src/domains/mnemonic/**` must use `@/domains/mnemonic` barrel.
 * Deep imports are blocked.
 */

// ─── Types ────────────────────────────────────────────────────────────────
export type {
  MnemonicStatus,
  HookType,
  HookMode,
  MnemonicSection,
  MnemonicCard,
  MnemonicTestLogEntry,
} from "./types";

// ─── Storage ────────────────────────────────────────────────────────────
export { DEFAULT_MAJOR_SYSTEM } from "./storage/constants";

export { loadMajorSystem, resolveNumber } from "./storage/major-system";

export {
  loadMnemonicCards,
  loadMnemonicCardsByCategory,
  saveMnemonicCards,
  notifyMnemonics,
} from "./storage/cards-repo";

export { createMnemonicCardFromSelection } from "./storage/card-factory";

export { getMnemonicStats } from "./storage/stats";

export { extractNumbers, detectEnumerationItems } from "./storage/content-utils";

export {
  EMPTY_MNEMONIC_DOC,
  decodeLegacySection,
  normalizeSectionOnRead,
  normalizeSectionForWrite,
  normalizeMnemonicCardOnRead,
  normalizeMnemonicCardOnImport,
  normalizeMnemonicCardForWrite,
  migrateMnemonicCard,
} from "./storage/mnemonic-section-codec";

export type { LegacyMnemonicSectionPayload } from "./storage/mnemonic-section-codec";

// ─── Analytics ──────────────────────────────────────────────────────────
export {
  calcWeakHooks,
  type WeakHook,
  type WeakHookMnemonicInput,
  type WeakHookLatencyInput,
  type CalcWeakHooksResult,
} from "./analytics/weak-hooks";
