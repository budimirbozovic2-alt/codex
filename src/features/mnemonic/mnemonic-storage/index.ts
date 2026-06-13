// Public barrel for `@/features/mnemonic/mnemonic-storage`.

export type {
  MnemonicStatus,
  HookType,
  MnemonicCard,
  MnemonicTestLogEntry,
} from "./types";

export { DEFAULT_MAJOR_SYSTEM } from "./constants";

export { loadMajorSystem, resolveNumber } from "./major-system";

export {
  loadMnemonicCards,
  loadMnemonicCardsByCategory,
  saveMnemonicCards,
  notifyMnemonics,
} from "./cards-repo";

export { createMnemonicCardFromSelection } from "./card-factory";

export { getMnemonicStats } from "./stats";

export { extractNumbers, detectEnumerationItems } from "./content-utils";

export {
  seedSectionDoc,
  getMnemonicSectionHtml,
  normalizeSectionOnRead,
  normalizeSectionForWrite,
  normalizeMnemonicCardOnRead,
  normalizeMnemonicCardForWrite,
  migrateMnemonicCard,
} from "./mnemonic-section-codec";
