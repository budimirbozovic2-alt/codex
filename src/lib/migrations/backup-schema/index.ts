/**
 * Barrel re-export for the backup schema, split into focused modules:
 *
 *  - helpers.ts              — Zod primitives (SafeHtml, SafeText, lenientArray, …)
 *  - cards.ts                — BackupSectionSchema, BackupCardSchema
 *  - taxonomy.ts             — Chapter / Subcategory / Category schemas
 *  - sources.ts              — BackupSourceSchema
 *  - mindmaps.ts             — BackupMindMapSchema
 *  - mnemonic.ts             — BackupMnemonicSchema
 *  - knowledge-base.ts       — BackupKnowledgeBaseArticleSchema
 *  - review-and-settings.ts  — review log + SR settings + settings KV
 *  - satellite-logs.ts       — diary, calibration, latency, slippage,
 *                              activity, discipline, pomodoro, mnemonic-test,
 *                              major-system
 *  - root.ts                 — top-level BackupSchema (v7), ParsedBackup
 *
 * Splitting the previous 697-line module keeps each schema unit independently
 * testable and trims the dep graph: callers that only need (say) the source
 * schema no longer transitively pull in mnemonic + satellite-log Zod chains.
 *
 * All historical named exports remain available via this barrel — no consumer
 * import path needs to change.
 */
export * from "./helpers";
export * from "./cards";
export * from "./taxonomy";
export * from "./sources";
export * from "./mindmaps";
export * from "./mnemonic";
export * from "./knowledge-base";
export * from "./review-and-settings";
export * from "./satellite-logs";
export * from "./root";
