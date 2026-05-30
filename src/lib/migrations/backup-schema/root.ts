import { z } from "zod";
import type { CategoryRecord } from "@/lib/db-types";
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

// ─── Top-level backup ───────────────────────────────────

export const BackupSchema = z
  .object({
    version: z.unknown().optional(),
    type: z.unknown().optional(),
    cards: z.array(BackupCardSchema).default([]),
    // Legacy backups had `categories: string[]` (names only). Accept either.
    categories: z
      .unknown()
      .transform((v): CategoryRecord[] | string[] => {
        if (!Array.isArray(v)) return [];
        if (v.length === 0) return [];
        const first = v[0];
        // New format: object with id+name → parse via BackupCategoryRecordSchema
        if (first && typeof first === "object" && "id" in first) {
          const out: CategoryRecord[] = [];
          for (const raw of v) {
            const r = BackupCategoryRecordSchema.safeParse(raw);
            if (r.success) out.push(r.data);
          }
          return out;
        }
        // Legacy format: array of name strings
        return v.filter((s): s is string => typeof s === "string");
      }),
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
  .passthrough();

export type ParsedBackup = z.infer<typeof BackupSchema>;
export type ParsedCard = z.infer<typeof BackupCardSchema>;
export type ParsedCategoryRecord = z.infer<typeof BackupCategoryRecordSchema>;

// ─── Legacy minimal-backup shape (used by remap migrations) ─────

export interface BackupChap {
  id: string;
  name: string;
}

export interface BackupSub {
  id: string;
  name: string;
  chapters?: BackupChap[];
}

export interface BackupCategory {
  id: string;
  name: string;
  subcategories?: BackupSub[];
}

export interface BackupCard {
  id: string;
  categoryId?: string;
  subcategoryId?: string;
  chapterId?: string;
}

export interface MinimalBackup {
  categories: BackupCategory[];
  cards: BackupCard[];
  type?: string;
  version?: number;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isMinimalBackup(json: unknown): json is MinimalBackup {
  if (!isObj(json)) return false;
  if (!Array.isArray(json.categories) || !Array.isArray(json.cards)) return false;
  if (json.categories.length > 0) {
    const c = json.categories[0];
    if (!isObj(c) || typeof c.id !== "string" || typeof c.name !== "string") return false;
  }
  if (json.cards.length > 0) {
    const c = json.cards[0];
    if (!isObj(c) || typeof c.id !== "string") return false;
  }
  return true;
}

export function normalizeName(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Strict type-guard wrapper around `BackupSchema.safeParse`.
 *
 * `useCardImport` calls `safeParse` directly so it can surface per-field error
 * paths in toasts. This export exists for callers that just need a boolean
 * predicate (drag-and-drop dropzones, restore preview, tests).
 */
export function isValidBackupPayload(data: unknown): data is ParsedBackup {
  return BackupSchema.safeParse(data).success;
}
