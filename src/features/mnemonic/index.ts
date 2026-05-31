/**
 * Public API of the mnemonic feature.
 * External callers must import from this barrel only.
 */
export { default as MnemonicModule } from "./MnemonicModule";

// Storage — types + IDB API used by backup, migrations, analytics, tests.
export type {
  MnemonicCard,
  MnemonicStatus,
  MnemonicTestLogEntry,
  HookType,
  HookMode,
} from "./mnemonic-storage";
export {
  DEFAULT_MAJOR_SYSTEM,
  JOKER_LOCATIONS,
  loadMajorSystem,
  saveMajorSystem,
  detectHookType,
  loadMnemonicCards,
  loadMnemonicCardsByCategory,
  saveMnemonicCards,
  deleteMnemonicCard,
  createMnemonicCard,
  createMnemonicCardFromSelection,
  loadMnemonicTestLog,
  addMnemonicTestEntry,
  getMnemonicStats,
  resolveNumber,
  extractNumbers,
  detectEnumerationItems,
} from "./mnemonic-storage";

// Test-tree helpers used by tests + (formerly) by external test-utility callers.
export {
  buildCategoryTree,
  buildHookTypeCounts,
  filterTestable,
  shuffle,
  buildUuidToName,
} from "./test-tree";
export type { TestFilter } from "./test-tree";

// Hooks exposed for tests.
export { useTestEngine, RECALL_TIME_LIMIT } from "./hooks/useTestEngine";
export type { SessionStats } from "./hooks/useTestEngine";
