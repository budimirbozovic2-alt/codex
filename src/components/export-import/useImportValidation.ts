import { db } from "@/lib/db";
import { yieldUI } from "@/lib/backup/yield-ui";
import { migrateRaw, BackupVersionError, BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";
import type { ImportValidation } from "./types";

export type ProgressFn = (pct: number, msg: string) => void;

export async function validateImportFile(
  file: File,
  onProgress: ProgressFn,
): Promise<ImportValidation> {
  try {
    onProgress(40, file.name.endsWith(".zip") ? "Dekompresija ZIP fajla..." : "Parsiranje podataka...");
    const { parseJsonInWorker } = await import("@/lib/zip-service");
    let parsed = (await parseJsonInWorker(file)) as Record<string, unknown>;

    const rawFileVersion = typeof parsed.version === "number" && Number.isFinite(parsed.version)
      ? Math.floor(parsed.version as number)
      : null;
    let willMigrate = false;
    let versionError: string | null = null;
    try {
      const migrated = migrateRaw(parsed) as Record<string, unknown>;
      if (rawFileVersion !== null && rawFileVersion < BACKUP_SCHEMA_VERSION) willMigrate = true;
      parsed = migrated;
    } catch (err) {
      if (err instanceof BackupVersionError) versionError = err.message;
      else versionError = err instanceof Error ? err.message : "Migracija backupa nije uspjela.";
    }

    onProgress(60, "Validacija podataka...");
    await yieldUI();
    const errors: string[] = [];
    if (versionError) errors.push(versionError);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUUID = (id: unknown): id is string => typeof id === "string" && uuidRegex.test(id);

    if (!parsed || typeof parsed !== "object") {
      errors.push("Fajl ne sadrži validan JSON objekat.");
    }

    const isLegacyCategoryFormat = !!parsed.categories && Array.isArray(parsed.categories) &&
      (parsed.categories as unknown[]).length > 0 && typeof (parsed.categories as unknown[])[0] === "string";

    if (parsed.categories && Array.isArray(parsed.categories) && !isLegacyCategoryFormat) {
      for (let i = 0; i < (parsed.categories as Array<{ id: string; name?: string }>).length; i++) {
        const cat = (parsed.categories as Array<{ id: string; name?: string }>)[i];
        if (!isValidUUID(cat.id)) {
          errors.push(`Kategorija '${cat.name || "Nepoznato"}' nema validan UUID (id).`);
          break;
        }
      }
    }

    const importedCards: Array<Record<string, unknown>> = (parsed.cards as Array<Record<string, unknown>>) || [];

    if (importedCards.length > 0) {
      const cTotal = importedCards.length;
      for (let i = 0; i < cTotal; i++) {
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
          onProgress(60 + Math.round((i / cTotal) * 10), `Validacija kartica ${i}/${cTotal}…`);
          await yieldUI();
        }
      }
    } else if (!parsed.categories && !parsed.mindMaps) {
      errors.push("Fajl ne sadrži podatke za import (cards, categories, ili mindMaps).");
    }

    if (parsed.sources && Array.isArray(parsed.sources)) {
      const arr = parsed.sources as Array<{ id: string; categoryId: string; title?: string }>;
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (!isValidUUID(s.id) || !isValidUUID(s.categoryId)) {
          errors.push(`Izvor '${s.title || "Nepoznato"}' nema validne UUID ključeve.`);
          break;
        }
        if (i > 0 && i % 1000 === 0) await yieldUI();
      }
    }

    if (parsed.mindMaps && Array.isArray(parsed.mindMaps)) {
      const arr = parsed.mindMaps as Array<{ id: string; title?: string }>;
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (!isValidUUID(m.id)) {
          errors.push(`Mentalna mapa '${m.title || "Nepoznato"}' nema validan UUID.`);
          break;
        }
      }
    }

    onProgress(72, "Provjera relacionog integriteta…");
    await yieldUI();
    const existingCats = await db.categories.toArray();
    if (errors.length === 0) {
      const validCategoryIds = new Set<string>();
      if (parsed.categories && Array.isArray(parsed.categories) && !isLegacyCategoryFormat) {
        (parsed.categories as Array<{ id: string }>).forEach((cat) => validCategoryIds.add(cat.id));
      }
      existingCats.forEach((cat) => validCategoryIds.add(cat.id));

      const skipFKCheck = isLegacyCategoryFormat;

      if (!skipFKCheck && importedCards.length > 0) {
        const cTotal = importedCards.length;
        for (let i = 0; i < cTotal; i++) {
          const c = importedCards[i];
          if (typeof c.categoryId === "string" && !validCategoryIds.has(c.categoryId)) {
            errors.push(`Kartica '${String(c.question ?? "").substring(0, 15)}...' pripada predmetu koji ne postoji u bazi ni u fajlu.`);
            break;
          }
          if (i > 0 && i % 2000 === 0) await yieldUI();
        }
      }
      if (!skipFKCheck && parsed.sources && Array.isArray(parsed.sources)) {
        const arr = parsed.sources as Array<{ categoryId?: string; title?: string }>;
        for (let i = 0; i < arr.length; i++) {
          const s = arr[i];
          if (s.categoryId && !validCategoryIds.has(s.categoryId)) {
            errors.push(`Izvor '${s.title?.substring(0, 15)}...' pripada predmetu koji ne postoji.`);
            break;
          }
          if (i > 0 && i % 2000 === 0) await yieldUI();
        }
      }
    }

    onProgress(82, "Provjera duplikata…");

    const freshCards = await db.cards.toArray();
    const existingIds = new Set(freshCards.map((c) => c.id));
    const duplicateCount = importedCards.filter((c) => typeof c.id === "string" && existingIds.has(c.id)).length;

    const existingCatIds = new Set(existingCats.map((c) => c.id));
    const existingCatNames = new Set(existingCats.map((c) => c.name.toLowerCase()));
    const duplicateCategoryCount = Array.isArray(parsed.categories)
      ? (parsed.categories as Array<{ id?: string; name?: string }>).filter((c) =>
          (c.id !== undefined && existingCatIds.has(c.id)) ||
          (c.name !== undefined && existingCatNames.has(c.name.toLowerCase()))
        ).length
      : 0;

    onProgress(100, "Validacija završena.");

    return {
      file,
      totalCards: importedCards.length,
      totalCategories: Array.isArray(parsed.categories) ? (parsed.categories as unknown[]).length : 0,
      hasProgress: parsed.type === "full",
      type: typeof parsed.type === "string" ? parsed.type : "unknown",
      fileSizeKB: Math.round(file.size / 1024),
      duplicateCount,
      duplicateCategoryCount,
      uniqueCount: importedCards.length - duplicateCount,
      valid: errors.length === 0,
      errors,
      fileVersion: rawFileVersion,
      appVersion: BACKUP_SCHEMA_VERSION,
      willMigrate,
    };
  } catch (err) {
    return {
      file,
      totalCards: 0,
      totalCategories: 0,
      hasProgress: false,
      type: "unknown",
      fileSizeKB: Math.round(file.size / 1024),
      duplicateCount: 0,
      duplicateCategoryCount: 0,
      uniqueCount: 0,
      valid: false,
      errors: [`Greška pri čitanju fajla: ${err instanceof Error ? err.message : "Neispravan format"}`],
      fileVersion: null,
      appVersion: BACKUP_SCHEMA_VERSION,
      willMigrate: false,
    };
  }
}
