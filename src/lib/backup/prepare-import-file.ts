/**
 * Unified import prepare — single parse + validate pipeline shared by the
 * validation dialog and the apply hook (no double JSON parse).
 */
import { readAllCategoriesForBackup, listAllCards } from "@/lib/db/queries";
import { yieldUI } from "@/lib/backup/yield-ui";
import { BackupSchema } from "@/lib/migrations/backup-schema";
import {
  migrateBackup,
  assertBackupVersion,
  BackupVersionError,
  BACKUP_SCHEMA_VERSION,
} from "@/lib/backup/migrate";
import { convertTemplateToParsedBackup, isTemplateExport } from "@/lib/backup/template-import";
import { convertEmergencyToParsedBackup, isLegacyEmergencyExport } from "@/lib/backup/emergency-import";
import { healBackupRaw } from "@/lib/backup/heal-backup";
import { parseJsonInWorker } from "@/lib/zip-service";
import type { ImportValidation, PreparedImport } from "@/components/export-import/types";

export type ProgressFn = (pct: number, msg: string) => void;

export type { PreparedImport } from "@/components/export-import/types";

export interface PrepareImportResult {
  validation: ImportValidation;
  prepared: PreparedImport | null;
}

async function parseImportPayload(
  file: File,
  onProgress: ProgressFn,
): Promise<PreparedImport> {
  onProgress(5, "Čitanje fajla…");
  let raw: unknown;
  try {
    raw = await parseJsonInWorker(file);
  } catch (err) {
    const msg = `Neispravan fajl: ${err instanceof Error ? err.message : "ne mogu pročitati JSON."}`;
    throw new Error(msg);
  }

  if (isTemplateExport(raw)) {
    onProgress(15, "Konverzija templatea…");
    const parsed = convertTemplateToParsedBackup(raw);
    await yieldUI();
    return { parsed, raw };
  }

  if (isLegacyEmergencyExport(raw)) {
    onProgress(15, "Konverzija hitnog backupa…");
    const parsed = convertEmergencyToParsedBackup(raw);
    await yieldUI();
    return { parsed, raw };
  }

  onProgress(12, "Provjera legacy formata…");
  const { raw: healedRaw, report: healReport } = healBackupRaw(raw);
  raw = healedRaw;
  if (healReport.sectionsHealed > 0) {
    onProgress(14, `Konverzija HTML sadržaja (${healReport.sectionsHealed} sekcija)…`);
  }
  await yieldUI();

  onProgress(15, "Provjera verzije…");
  assertBackupVersion(raw);
  await yieldUI();

  onProgress(20, "Validacija šeme…");
  await yieldUI();
  const result = BackupSchema.safeParse(raw);
  await yieldUI();
  if (!result.success) {
    const issues = result.error.issues.slice(0, 5);
    const summary = issues
      .map((iss) => `• ${iss.path.join(".") || "(root)"} — ${iss.message}`)
      .join("\n");
    const more = result.error.issues.length > issues.length
      ? `\n…i još ${result.error.issues.length - issues.length} grešaka.`
      : "";
    throw new Error(`Backup nije validan:\n${summary}${more}`);
  }

  const parsed = migrateBackup(result.data);
  return { parsed, raw };
}

async function buildImportValidation(
  file: File,
  prepared: PreparedImport,
  onProgress: ProgressFn,
): Promise<ImportValidation> {
  const { parsed, raw } = prepared;
  const rawObj = raw as Record<string, unknown>;

  const rawFileVersion = typeof rawObj.version === "number" && Number.isFinite(rawObj.version)
    ? Math.floor(rawObj.version as number)
    : null;
  const templateFile = isTemplateExport(raw);
  const emergencyFile = isLegacyEmergencyExport(raw);

  onProgress(60, "Validacija podataka…");
  await yieldUI();

  const errors: string[] = [];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUUID = (id: unknown): id is string => typeof id === "string" && uuidRegex.test(id);

  const importedCards = parsed.cards;

  if (importedCards.length > 0) {
    for (let i = 0; i < importedCards.length; i++) {
      const c = importedCards[i];
      if (!isValidUUID(c.id)) {
        errors.push(`Kartica na indeksu ${i} nema validan UUID (id).`);
        break;
      }
      if (c.categoryId !== undefined && !isValidUUID(c.categoryId)) {
        errors.push(`Kartica '${String(c.question ?? "").substring(0, 15)}...' ima neispravan categoryId UUID.`);
        break;
      }
      if (!Array.isArray(c.sections)) {
        errors.push(`Kartica na indeksu ${i} nema validan 'sections' niz.`);
        break;
      }
      if (i > 0 && i % 1000 === 0) {
        onProgress(60 + Math.round((i / importedCards.length) * 10), `Validacija kartica ${i}/${importedCards.length}…`);
        await yieldUI();
      }
    }
  } else if (parsed.categories.length === 0 && parsed.mindMaps.length === 0) {
    errors.push("Fajl ne sadrži podatke za import (cards, categories, ili mindMaps).");
  }

  for (const cat of parsed.categories) {
    if (!isValidUUID(cat.id)) {
      errors.push(`Kategorija '${cat.name || "Nepoznato"}' nema validan UUID (id).`);
      break;
    }
  }

  for (const s of parsed.sources) {
    if (!isValidUUID(s.id) || !isValidUUID(s.categoryId)) {
      errors.push(`Izvor '${s.title || "Nepoznato"}' nema validne UUID ključeve.`);
      break;
    }
  }

  for (const m of parsed.mindMaps) {
    if (!isValidUUID(m.id)) {
      errors.push(`Mentalna mapa '${m.title || "Nepoznato"}' nema validan UUID.`);
      break;
    }
  }

  onProgress(72, "Provjera relacionog integriteta…");
  await yieldUI();
  const existingCats = await readAllCategoriesForBackup();
  if (errors.length === 0) {
    const validCategoryIds = new Set<string>([
      ...parsed.categories.map((c) => c.id),
      ...existingCats.map((c) => c.id),
    ]);

    for (let i = 0; i < importedCards.length; i++) {
      const c = importedCards[i];
      if (typeof c.categoryId === "string" && !validCategoryIds.has(c.categoryId)) {
        errors.push(`Kartica '${String(c.question ?? "").substring(0, 15)}...' pripada predmetu koji ne postoji u bazi ni u fajlu.`);
        break;
      }
      if (i > 0 && i % 2000 === 0) await yieldUI();
    }

    for (const s of parsed.sources) {
      if (s.categoryId && !validCategoryIds.has(s.categoryId)) {
        errors.push(`Izvor '${s.title?.substring(0, 15)}...' pripada predmetu koji ne postoji.`);
        break;
      }
    }
  }

  onProgress(82, "Provjera duplikata…");
  const freshCards = await listAllCards();
  const existingIds = new Set(freshCards.map((c) => c.id));
  const duplicateCount = importedCards.filter((c) => existingIds.has(c.id)).length;

  const existingCatIds = new Set(existingCats.map((c) => c.id));
  const existingCatNames = new Set(existingCats.map((c) => c.name.toLowerCase()));
  const duplicateCategoryCount = parsed.categories.filter((c) =>
    existingCatIds.has(c.id) || existingCatNames.has(c.name.toLowerCase()),
  ).length;

  onProgress(100, "Validacija završena.");

  return {
    file,
    totalCards: importedCards.length,
    totalCategories: parsed.categories.length,
    hasProgress: emergencyFile || parsed.type === "full",
    type: typeof parsed.type === "string" ? parsed.type : "unknown",
    fileSizeKB: Math.round(file.size / 1024),
    duplicateCount,
    duplicateCategoryCount,
    existingCardsCount: freshCards.length,
    uniqueCount: importedCards.length - duplicateCount,
    valid: errors.length === 0,
    errors,
    fileVersion: rawFileVersion,
    appVersion: BACKUP_SCHEMA_VERSION,
    willMigrate: templateFile || emergencyFile,
    prepared: null,
  };
}

function invalidValidation(
  file: File,
  errors: string[],
): ImportValidation {
  return {
    file,
    totalCards: 0,
    totalCategories: 0,
    hasProgress: false,
    type: "unknown",
    fileSizeKB: Math.round(file.size / 1024),
    duplicateCount: 0,
    duplicateCategoryCount: 0,
    existingCardsCount: 0,
    uniqueCount: 0,
    valid: false,
    errors,
    fileVersion: null,
    appVersion: BACKUP_SCHEMA_VERSION,
    willMigrate: false,
    prepared: null,
  };
}

/** Parse once, validate, return UI metadata + ready-to-apply payload. */
export async function prepareImportFile(
  file: File,
  onProgress: ProgressFn,
): Promise<PrepareImportResult> {
  onProgress(40, file.name.endsWith(".zip") ? "Dekompresija ZIP fajla..." : "Parsiranje podataka...");
  let prepared: PreparedImport;
  try {
    prepared = await parseImportPayload(file, onProgress);
  } catch (err) {
    const message = err instanceof BackupVersionError
      ? err.message
      : err instanceof Error
        ? err.message
        : "Backup nije podržan.";
    return {
      validation: invalidValidation(file, [message]),
      prepared: null,
    };
  }

  const validation = await buildImportValidation(file, prepared, onProgress);
  if (!validation.valid) {
    return { validation, prepared: null };
  }

  return {
    validation: { ...validation, prepared },
    prepared,
  };
}
