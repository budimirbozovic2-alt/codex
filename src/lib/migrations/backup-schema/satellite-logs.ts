import { z } from "zod";
import { SafeText, NumberWithDefault, NullableNumber } from "./helpers";

export const BackupDiarySchema = z
  .object({
    id: z.string(),
    date: SafeText,
    dailyGoal: SafeText,
    selfAnalysis: SafeText,
    createdAt: NumberWithDefault(Date.now()),
  })
  .strict();

export const BackupCalibrationSchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    cardId: z.string(),
    sectionId: SafeText,
    confidence: NumberWithDefault(0),
    actualGrade: NumberWithDefault(0),
    category: SafeText,
  })
  .strict();

export const BackupLatencySchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    cardId: z.string(),
    sectionId: SafeText,
    latencyMs: NumberWithDefault(0),
    category: SafeText,
  })
  .strict();

export const BackupSlippageSchema = z
  .object({
    date: SafeText,
    appEntryTime: NumberWithDefault(0),
    firstActionTime: NullableNumber,
    slippageMs: NullableNumber,
  })
  .strict();

export const BackupActivitySchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    type: z.unknown().transform((v) => (typeof v === "string" ? v : "admin")),
    durationMs: NumberWithDefault(0),
    category: z.unknown().optional().transform((v) => (typeof v === "string" ? v : undefined)),
  })
  .strict();

export const BackupDisciplineSchema = z
  .object({
    date: SafeText,
    status: z.unknown().transform((v) => (v === "diligent" || v === "neutral" || v === "lazy" ? v : "neutral")),
    planCompletion: NumberWithDefault(0),
    slippageMs: NullableNumber,
    reviewsDone: NumberWithDefault(0),
    suggestedReviews: NumberWithDefault(0),
  })
  .strict();

export const BackupPomodoroLogSchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    type: z.unknown().transform((v) => (v === "focus" || v === "break" ? v : "focus")),
    durationMinutes: NumberWithDefault(0),
  })
  .strict();

export const BackupMnemonicTestLogSchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    cardId: z.string(),
    success: z.unknown().transform((v) => v === true),
  })
  .strict();

export const BackupMajorSystemSchema = z
  .object({
    id: z.number().int().nonnegative(),
    peg: SafeText,
  })
  .strict();
