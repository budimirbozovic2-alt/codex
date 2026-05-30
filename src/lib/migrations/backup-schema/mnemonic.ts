import { z } from "zod";
import type { MnemonicCard } from "@/features/mnemonic";
import {
  SafeHtml,
  SafeText,
  NumberWithDefault,
  NullableNumber,
  StringArray,
} from "./helpers";

const MnemonicSectionSchema = z
  .object({ title: SafeText, content: SafeHtml })
  .strict();

export const BackupMnemonicSchema = z
  .object({
    id: z.string(),
    originalCardId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    question: SafeHtml,
    sections: z.array(MnemonicSectionSchema).default([]),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    subcategoryId: z.unknown().optional(),
    // Legacy aliases (pre-UUID backups stored taxonomy as name strings).
    // Mirrors the same pattern used by BackupCardSchema; the legacy-resolver
    // in applyImportAtomically remaps name → UUID post-parse.
    category: z.unknown().optional(),
    subcategory: z.unknown().optional(),
    tags: StringArray,
    hookType: z.unknown().optional().transform((v) => (v === "rokovi" || v === "nabrajanja" || v === "ostalo" ? v : "ostalo")),
    hookMode: z.unknown().optional().transform((v) => (v === "video" || v === "acronym" ? v : "video")),
    mnemonicVideo: SafeText,
    acronym: SafeText,
    mnemonicStatus: z.unknown().optional().transform((v) => (v === "new" || v === "in-workshop" || v === "ready" ? v : "new")),
    createdAt: NumberWithDefault(Date.now()),
    testCount: NumberWithDefault(0),
    successCount: NumberWithDefault(0),
    failCount: NumberWithDefault(0),
    lastTested: NullableNumber,
  })
  .strict()
  .transform((m): MnemonicCard => {
    const catId =
      typeof m.categoryId === "string" && m.categoryId ? m.categoryId :
      typeof m.category === "string" ? m.category : "";
    const subId =
      typeof m.subcategoryId === "string" ? m.subcategoryId :
      typeof m.subcategory === "string" ? m.subcategory : undefined;
    const out: MnemonicCard = {
      id: m.id,
      originalCardId: m.originalCardId,
      question: m.question,
      sections: m.sections as MnemonicCard["sections"],
      categoryId: catId,
      tags: m.tags,
      hookType: m.hookType,
      hookMode: m.hookMode,
      mnemonicVideo: m.mnemonicVideo,
      acronym: m.acronym,
      mnemonicStatus: m.mnemonicStatus,
      createdAt: m.createdAt,
      testCount: m.testCount,
      successCount: m.successCount,
      failCount: m.failCount,
      lastTested: m.lastTested,
    };
    if (typeof subId === "string" && subId) out.subcategoryId = subId;
    return out;
  });
