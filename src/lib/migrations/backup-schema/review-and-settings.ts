import { z } from "zod";
import { SafeText, NumberWithDefault } from "./helpers";

// ─── Settings entry (db.settings table: { key, value }) ─
export const BackupSettingsEntrySchema = z
  .object({ key: z.string(), value: z.unknown() })
  .strict();

// ─── Review log / SR settings ───────────────────────────

const ReasonSchema = z.object({ code: z.string(), label: z.string() }).strict();

export const BackupReviewLogEntrySchema = z
  .object({
    cardId: z.string(),
    sectionId: z.string().optional(),
    timestamp: NumberWithDefault(Date.now()),
    grade: NumberWithDefault(0),
    category: SafeText,
    reasons: z.array(ReasonSchema).optional(),
    effectiveRetention: z.unknown().optional().transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
    intervalMultiplier: z.unknown().optional().transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
  })
  .strict();

const ResistanceWeightsSchema = z
  .object({
    lapses: z.number().finite(),
    latency: z.number().finite(),
    forgetting: z.number().finite(),
  })
  .strict();

export const BackupSRSettingsSchema = z
  .object({
    leechThreshold: z.number().finite().optional(),
    dailyGoal: z.number().finite().optional(),
    resistanceWeights: ResistanceWeightsSchema.optional(),
  })
  .strict();
