/**
 * Public API barrel for `@/lib/db/queries`.
 *
 * Hooks consume this barrel directly (see ESLint `no-restricted-imports`
 * override for `src/hooks/**`). UI components remain blocked — they must
 * route through a hook.
 *
 * Walled per architecture memory: deep imports into sibling files are
 * forbidden, the barrel is the single seam.
 */
// PR-9 A1b P1.5 — cards read path (SQLite-primary, Dexie fallback).
export {
  listAllCards,
  getCardsByIds,
  cardsByCategory,
  cardsBySubcategory,
  cardsByChapter,
  cardsByType,
  cardsBySource,
  cardsByTag,
  cardCountByCategory,
  cardCountByChapter,
  cardCountByType,
  onCardsChanged,
  notifyCardsChanged,
  deleteCardsByCategoryDexie,
  reparentCardsByCategoryDexie,
} from "./cards";

// Re-export legacy query helpers that still live in `src/lib/db-queries.ts`
// so hooks have a single, sanctioned entry-point and never reach `@/lib/db`.
// `idbLoadCards`/`idbLoadCardsByChapter` are deprecated — P1.5 callers should
// prefer `listAllCards` / `cardsByChapter` from the cards repo above.
export {
  idbLoadSettings,
  idbSaveSettings,
} from "@/lib/db-queries";

// PR-9 M3 — SQLite-primary read/write repos.
export {
  loadPlannerSnapshot,
  savePlannerConfig,
  saveDailyMapped,
  saveLastRedistribute,
  saveDisciplineLog as savePlannerDisciplineLog,
} from "./planner";
export {
  getDraft,
  putDraft,
  deleteDraft,
  bulkDeleteDrafts,
  listDraftsBySource,
  listAllDrafts,
  onDraftsChanged,
} from "./drafts";
export {
  getSetting,
  putSetting,
  deleteSetting,
  listSettingsByPrefix,
  onSettingsChanged,
} from "./settings";
export {
  getSource,
  listAllSources,
  listSourcesByCategory,
  putSource,
  deleteSourceAndUnlinkCards,
  deleteSourcesByCategoryDexie,
  reparentSourcesByCategoryDexie,
} from "./sources";
export {
  getMindMap,
  listAllMindMaps,
  listMindMapsByCategory,
  putMindMap,
  deleteMindMap,
  deleteMindMapsByCategoryDexie,
} from "./mind-maps";
export {
  getMnemonic,
  listAllMnemonics,
  listMnemonicsByCategory,
  putMnemonic,
  bulkPutMnemonics,
  deleteMnemonic,
  deleteMnemonicsByCategoryDexie,
} from "./mnemonics";
export {
  getArticle as getKnowledgeBaseArticle,
  listArticlesBySubject,
  findArticleByTitle,
  putArticle as putKnowledgeBaseArticle,
  bulkPutArticles as bulkPutKnowledgeBaseArticles,
  deleteArticle as deleteKnowledgeBaseArticle,
  deleteArticlesBySubjectDexie,
  onKnowledgeBaseChanged,
  notifyKnowledgeBaseChanged,
} from "./knowledge-base";
// PR-9 A1b P1.6 — mnemonic aux tables (Major System + test log).
export {
  listAllPegs as listAllMajorSystemPegs,
  bulkPutPegs as bulkPutMajorSystemPegs,
} from "./major-system";
export type { MajorSystemPeg } from "./major-system";
export {
  listAllTestLogEntries,
  listTestLogEntriesByCard,
  addTestLogEntry,
} from "./mnemonic-test-log";
// PR-9 A1b P1.B — consolidated backup/health read seam (SQLite-primary
// where possible, explicit Dexie read-replicas where not yet migrated).
export * from "./backup-readers";
