import { useCallback } from "react";
import { toast } from "sonner";
import { createCard, type Card as SpacedCard } from "@/lib/spaced-repetition";
import type { EditorDoc } from "@/lib/editor-v4/types";
import { invalidateSourcesCache } from "@/domains/sources/sources-storage";
import { BackupSchema, type ParsedBackup } from "@/lib/migrations/backup-schema";
import { migrateBackup, assertBackupVersion, BackupVersionError } from "@/lib/backup/migrate";
import { yieldUI } from "@/lib/backup/yield-ui";
import { applyImportAtomically, type ImportStrategy } from "@/lib/backup/import-transaction";
import { parseJsonInWorker } from "@/lib/zip-service";
import { clearReviewSession } from "@/domains/review/review-session-storage";
import {
  announceCardsReplaced,
  bulkPutCardsDirect,
  listAllCards,
} from "@/lib/db/queries";
import { categoryRepository } from "@/lib/repositories";
import { replaceReviewLog, updateSRSettings } from "@/store/reviewSettingsStore";

import { logger } from "@/lib/logger";
export type ImportProgress = (pct: number, label: string) => void;

/** Whitelisted localStorage keys that the import path is allowed to restore. */
const ALLOWED_LS_KEYS = new Set([
  "sr-app-settings", "sr-mnemonic-workshop", "sr-mnemonic-associations",
  "sr-major-system-map", "sr-learn-progress", "sr-last-backup",
  "sr-planner-config", "sr-daily-mapped-count", "sr-daily-mapped-date",
  "sr-dark-mode", "sr-tts-settings",
]);
const VALID_THEMES = new Set(["amber", "slate", "forest", "ocean", "rose", "midnight"]);

function sanitizeLSValue(v: unknown): unknown {
  if (typeof v === "string") {
    if (/[<>]/.test(v)) return "";
    return v;
  }
  if (Array.isArray(v)) return v.map(sanitizeLSValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = sanitizeLSValue(val);
    }
    if (typeof out.colorTheme === "string" && !VALID_THEMES.has(out.colorTheme)) {
      out.colorTheme = "ocean";
    }
    return out;
  }
  return v;
}

export function useCardImport() {
  const setReviewLog = replaceReviewLog;

  const importData = useCallback(
    async (
      file: File,
      strategy: ImportStrategy = "skip",
      onProgress?: ImportProgress,
    ): Promise<void> => {
      const progress: ImportProgress = onProgress ?? (() => { /* noop */ });

      // ── 1. Parse off-thread ──
      progress(5, "Čitanje fajla…");
      let raw: unknown;
      try {
        raw = await parseJsonInWorker(file);
      } catch (err) {
        const msg = `Neispravan fajl: ${err instanceof Error ? err.message : "ne mogu pročitati JSON."}`;
        toast.error(msg);
        throw new Error(msg);
      }

      // ── 2. Version gate (v7 only) ──
      progress(15, "Provjera verzije…");
      try {
        assertBackupVersion(raw);
      } catch (err) {
        const msg = err instanceof BackupVersionError ? err.message : "Backup nije podržan.";
        toast.error(msg);
        throw err instanceof Error ? err : new Error(msg);
      }
      await yieldUI();

      // ── 3. Zod validation ──
      progress(20, "Validacija šeme…");
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
        toast.error(`Backup nije validan:\n${summary}${more}`);
        throw new Error("Backup nije validan");
      }

      // ── 4. Post-Zod migration ladder ──
      let parsed: ParsedBackup;
      try {
        parsed = migrateBackup(result.data);
      } catch (err) {
        const msg = err instanceof BackupVersionError ? err.message : "Migracija backupa nije uspjela.";
        toast.error(msg);
        logger.error("[useCardImport] migrate failed", err);
        throw err instanceof Error ? err : new Error(msg);
      }

      if (parsed.cards.length === 0 && (!Array.isArray(parsed.categories) || parsed.categories.length === 0)) {
        const msg = "Fajl ne sadrži kartice ni kategorije za uvoz.";
        toast.error(msg);
        throw new Error(msg);
      }

      // ── 5. Atomic transactional apply ──
      progress(25, "Priprema podataka…");
      let result2: Awaited<ReturnType<typeof applyImportAtomically>>;
      try {
        // Build baseline from SQLite (former RAM cardMap is gone post PR-E).
        const allCards = await listAllCards();
        const baseline: Record<string, SpacedCard> = {};
        for (const c of allCards) baseline[c.id] = c;
        result2 = await applyImportAtomically({
          parsed,
          strategy,
          currentMap: baseline,
          onProgress: progress,
        });
      } catch (err) {
        const msg = `Greška pri uvozu: ${err instanceof Error ? err.message : "atomic apply failed."}`;
        toast.error(msg);
        logger.error("[useCardImport] applyImportAtomically failed", err);
        throw err instanceof Error ? err : new Error(msg);
      }

      // ── 6. Cache sync after the tx commits ──
      // Atomic apply already wrote the cards to SQLite; announce so the
      // bridge invalidates `['cards']` and consumers re-fetch.
      announceCardsReplaced(result2.nextMap);
      categoryRepository.replaceAll(result2.freshCategories);
      if (result2.reviewLogApplied) setReviewLog(result2.reviewLogApplied);
      if (result2.srSettingsApplied) updateSRSettings(result2.srSettingsApplied);
      invalidateSourcesCache();

      // ── 7. localStorage restore (whitelist + sanitize) ──
      if (parsed.localStorageData && typeof parsed.localStorageData === "object") {
        for (const [key, value] of Object.entries(parsed.localStorageData as Record<string, unknown>)) {
          if (!ALLOWED_LS_KEYS.has(key)) continue;
          try {
            const parsedVal = typeof value === "string" ? JSON.parse(value) : value;
            const clean = sanitizeLSValue(parsedVal);
            localStorage.setItem(key, JSON.stringify(clean));
          } catch {
            if (typeof value === "string" && !/[<>]/.test(value)) {
              localStorage.setItem(key, value);
            }
          }
        }
      }
      if (strategy === "overwrite") {
        clearReviewSession();
      }

      // ── 8. Toast summary ──
      const extraParts: string[] = [];
      if (parsed.sources.length > 0) extraParts.push(`${parsed.sources.length} izvora`);
      if (parsed.mindMaps.length > 0) extraParts.push(`${parsed.mindMaps.length} mentalnih mapa`);
      if (parsed.diary.length > 0) extraParts.push(`${parsed.diary.length} dnevničkih zapisa`);
      if (parsed.mnemonics.length > 0) extraParts.push(`${parsed.mnemonics.length} mnemoničkih kartica`);
      if (parsed.disciplineLog.length > 0) extraParts.push("disciplinski log");
      if (Array.isArray(parsed.settings) && parsed.settings.length > 0) {
        extraParts.push(`${parsed.settings.length} postavki`);
      }
      if (parsed.pomodoroLog.length > 0) extraParts.push(`${parsed.pomodoroLog.length} pomodoro zapisa`);
      if (parsed.localStorageData) extraParts.push("lokalna podešavanja");
      const extraMsg = extraParts.length > 0 ? ` + ${extraParts.join(", ")}` : "";
      progress(100, "Završeno.");
      toast.success(`Uspješno uvezeno ${parsed.cards.length} kartica${extraMsg}.`);
    },
    [setReviewLog],
  );

  // PR-E3 — importCards writes directly to SQLite via bulkPutCardsDirect.
  // The bridge invalidates `['cards']` after the flush so any open scoped
  // query refetches.
  const importCards = useCallback(
    (newCards: { question: string; sections: { title: string; contentDoc: EditorDoc }[] }[], category: string) => {
      const created = newCards.map((c) =>
        createCard(c.question, c.sections, category),
      );
      const now = Date.now();
      created.forEach((c) => { c.updatedAt = now; });
      if (created.length > 0) void bulkPutCardsDirect(created);
    },
    [],
  );

  return { importData, importCards };
}
