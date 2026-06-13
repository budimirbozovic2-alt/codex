import { z } from "zod";
import type { MnemonicCard } from "@/features/mnemonic";
import {
  SafeHtml,
  SafeText,
  NumberWithDefault,
  NullableNumber,
  StringArray,
  EditorDocV4,
} from "./helpers";

const MnemonicSectionSchema = z
  .object({
    title: SafeText,
    contentDoc: EditorDocV4,
  })
  .strict();

export const BackupMnemonicSchema = z
  .object({
    id: z.string(),
    originalCardId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    question: SafeHtml,
    sections: z.array(MnemonicSectionSchema).default([]),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    subcategoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : undefined)),
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
    const out: MnemonicCard = {
      id: m.id,
      originalCardId: m.originalCardId,
      question: m.question,
      sections: m.sections as MnemonicCard["sections"],
      categoryId: m.categoryId,
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
    if (m.subcategoryId) out.subcategoryId = m.subcategoryId;
    return out;
  });
