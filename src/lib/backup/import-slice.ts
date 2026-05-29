/**
 * Import slice — selective restore.
 *
 * Pure function. Given a fully-parsed backup, return a copy where all
 * domains except cards + taxonomy (categories) are emptied. Feeds the same
 * `applyImportAtomically` pipeline so the SQLite ACID transaction simply
 * sees empty satellite arrays and writes nothing for them.
 *
 * Used by the "Samo kartice + taksonomija" import mode — lets a user pull
 * in 800+ cards from an older v7 backup without touching the refactored
 * app's Sources, Knowledge Base, Mind Maps, Mnemonics, logs or settings.
 */
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

export type ImportSlice = "full" | "cards-and-taxonomy";

export function sliceParsedBackup(
  parsed: ParsedBackup,
  slice: ImportSlice,
): ParsedBackup {
  if (slice === "full") return parsed;
  return {
    ...parsed,
    sources: [],
    mindMaps: [],
    diary: [],
    calibrationLog: [],
    latencyLog: [],
    slippageLog: [],
    activityLog: [],
    disciplineLog: [],
    pomodoroLog: [],
    mnemonics: [],
    majorSystem: [],
    mnemonicTestLog: [],
    knowledgeBaseArticles: [],
    settings: [],
    reviewLog: [],
    srSettings: undefined,
    localStorageData: undefined,
  } as ParsedBackup;
}
