/**
 * .test.ts files that need jsdom (renderHook, document or window) but are not .tsx.
 * Remaining src test.ts files run in node for faster startup.
 */
export const jsdomTsTestGlobs = [
  // React hooks
  "**/hooks/**/*.test.ts",
  // DOM interaction / guards
  "**/body-pointer-events*.test.ts",
  "**/heading-navigation.test.ts",
  "**/pending-source-open.test.ts",
  "**/executor-telemetry.test.ts",
  // i18n + autosave
  "**/i18n.test.ts",
  "**/card-draft-autosave.test.ts",
  "**/use-draft-autosave.test.ts",
  "**/category-stats-lazy.test.ts",
  // Editor v4 + HTML pipeline (needs DOMPurify / TipTap DOM)
  "**/editor-v4*.test.ts",
  "**/bold-period-split.test.ts",
  "**/selection-split-engine.test.ts",
  "**/skripta-legal-autoformat.test.ts",
  "**/source-editing-service.test.ts",
  "**/source-reader-build-essay.test.ts",
  "**/backup-schema.test.ts",
  "**/template-import.test.ts",
  "**/boot-heal-migration.test.ts",
  "**/knowledge-base-decode.test.ts",
  "**/mnemonic-section-codec.test.ts",
  // Zettelkasten wiki-link AST
  "**/zettelkasten*.test.ts",
  // Auto-split + backlinks
  "**/auto-split*.test.ts",
  "**/backlink-index.test.ts",
  // Electron SQLite IPC / ready machine
  "**/main-ipc-executor.test.ts",
  "**/sqlite-backend.test.ts",
  "**/sqlite-ready-machine.test.ts",
  "**/ready-machine.test.ts",
  // Backup heal (htmlToDoc on payloads)
  "**/heal-backup.test.ts",
  // Misc hooks / UI-adjacent unit tests
  "**/knowledge-base-mutations.test.ts",
  "**/mnemonic-test-engine.test.ts",
  "**/pr-h1-critical-fixes.test.ts",
  "**/selection-format-preserve.test.ts",
  "**/useCardOrgDnd-saga.test.ts",
  "**/useSourceMapping.test.ts",
  "**/readiness-score.test.ts",
] as const;
