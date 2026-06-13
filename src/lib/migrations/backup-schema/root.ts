import { z } from "zod";
import { lenientArray } from "./helpers";
import { BackupCardSchema } from "./cards";
import { BackupCategoryRecordSchema } from "./taxonomy";
import { BackupSourceSchema } from "./sources";
import { BackupMindMapSchema } from "./mindmaps";
import { BackupMnemonicSchema } from "./mnemonic";
import { BackupKnowledgeBaseArticleSchema } from "./knowledge-base";
import {
  BackupReviewLogEntrySchema,
  BackupSettingsEntrySchema,
  BackupSRSettingsSchema,
} from "./review-and-settings";
import {
  BackupDiarySchema,
  BackupCalibrationSchema,
  BackupLatencySchema,
  BackupSlippageSchema,
  BackupActivitySchema,
  BackupDisciplineSchema,
  BackupPomodoroLogSchema,
  BackupMnemonicTestLogSchema,
  BackupMajorSystemSchema,
} from "./satellite-logs";

// ─── Top-level backup (v7 only) ───────────────────────────────────────────

export const BackupSchema = z
  .object({
    version: z.literal(7),
    type: z.enum(["full", "template"]).optional(),
    cards: z.array(BackupCardSchema).default([]),
    categories: z.array(BackupCategoryRecordSchema).default([]),
    subcategories: z.unknown().optional(),
    reviewLog: lenientArray(BackupReviewLogEntrySchema, "reviewLog"),
    srSettings: z
      .unknown()
      .optional()
      .transform((v) => {
        if (v === undefined || v === null) return undefined;
        const r = BackupSRSettingsSchema.safeParse(v);
        return r.success ? r.data : undefined;
      }),
    sources: z.array(BackupSourceSchema).default([]),
    mindMaps: z.array(BackupMindMapSchema).default([]),
    diary: lenientArray(BackupDiarySchema, "diary"),
    calibrationLog: lenientArray(BackupCalibrationSchema, "calibrationLog"),
    latencyLog: lenientArray(BackupLatencySchema, "latencyLog"),
    slippageLog: lenientArray(BackupSlippageSchema, "slippageLog"),
    activityLog: lenientArray(BackupActivitySchema, "activityLog"),
    disciplineLog: lenientArray(BackupDisciplineSchema, "disciplineLog"),
    pomodoroLog: lenientArray(BackupPomodoroLogSchema, "pomodoroLog"),
    mnemonics: lenientArray(BackupMnemonicSchema, "mnemonics"),
    majorSystem: lenientArray(BackupMajorSystemSchema, "majorSystem"),
    mnemonicTestLog: lenientArray(BackupMnemonicTestLogSchema, "mnemonicTestLog"),
    knowledgeBaseArticles: z.array(BackupKnowledgeBaseArticleSchema).default([]),
    settings: z.array(BackupSettingsEntrySchema).default([]),
    localStorageData: z.unknown().optional(),
  })
  .strict();

export type ParsedBackup = z.infer<typeof BackupSchema>;

/** Re-export for callers that validate version before parse. */
export const BACKUP_SCHEMA_VERSION = 7;
