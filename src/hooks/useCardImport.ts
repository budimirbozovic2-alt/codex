import { useCallback, MutableRefObject } from "react";
import { toast } from "sonner";
import { Card, createCard, SRSettings } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, bumpMapVersion, schedulePersist } from "@/lib/persist-queue";
import type { CategoryRecord } from "@/lib/db";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { BackupSchema, type ParsedBackup } from "@/lib/migrations/backup-schema";
import { migrateBackup, migrateRaw, BackupVersionError } from "@/lib/backup/migrate";
import { yieldUI } from "@/lib/backup/yield-ui";
import { applyImportAtomically, type ImportStrategy } from "@/lib/backup/import-transaction";
import { parseJsonInWorker } from "@/lib/zip-service";
import { clearReviewSession } from "@/lib/review-session-storage";

import { logger } from "@/lib/logger";
export type ImportProgress = (pct: number, label: string) => void;

interface UseCardImportDeps {
  setCategoryRecords: React.Dispatch<React.SetStateAction<CategoryRecord[]>>;
  setReviewLog: (log: ReviewLogEntry[]) => void;
  updateSRSettings: (settings: SRSettings) => void;
  setCardMapState: (updater: (prev: CardMap) => CardMap) => void;
  cardMapRef: MutableRefObject<CardMap>;
}

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

export function useCardImport({
  setCategoryRecords,
  setReviewLog,
  updateSRSettings,
  setCardMapState,
  cardMapRef,
}: UseCardImportDeps) {
  const importData = useCallback(
    async (
      file: File,
      strategy: ImportStrategy = "skip",
      onProgress?: ImportProgress,
    ) => {
      const progress: ImportProgress = onProgress ?? (() => { /* noop */ });
      try {
        // ── 1. Parse off-thread (Phase 3a) ──
        progress(5, "Čitanje fajla…");
        let raw: unknown;
        try {
          raw = await parseJsonInWorker(file);
        } catch (err) {
          toast.error(`Neispravan fajl: ${err instanceof Error ? err.message : "ne mogu pročitati JSON."}`);
          return;
        }

        // ── 2. Pre-Zod migration (Phase 4.1) ──
        progress(15, "Migracija formata…");
        try {
          raw = migrateRaw(raw);
        } catch (err) {
          if (err instanceof BackupVersionError) toast.error(err.message);
          else toast.error("Migracija backupa nije uspjela.");
          return;
        }
        await yieldUI();

        // ── 3. Zod validation (Phase 1.1: yield around the sync hot loop) ──
        progress(20, "Validacija šeme…");
        await yieldUI();
        const result = BackupSchema.safeParse(raw);
        await yieldUI();
        if (!result.success) {
          const issue = result.error.issues[0];
          const path = issue?.path.join(".") || "(root)";
          toast.error(`Backup nije validan: ${path} — ${issue?.message ?? "nepoznata greška"}`);
          return;
        }

        // ── 4. Post-Zod migration ladder (idempotent on already-migrated input) ──
        let parsed: ParsedBackup;
        try {
          parsed = migrateBackup(result.data);
        } catch (err) {
          if (err instanceof BackupVersionError) toast.error(err.message);
          else toast.error("Migracija backupa nije uspjela.");
          logger.error("[useCardImport] migrate failed", err);
          return;
        }

        if (parsed.cards.length === 0 && (!Array.isArray(parsed.categories) || parsed.categories.length === 0)) {
          toast.error("Fajl ne sadrži kartice ni kategorije za uvoz.");
          return;
        }

        // ── 5. Atomic transactional apply (Phases 1.3 + 2.1) ──
        progress(25, "Priprema podataka…");
        const result2 = await applyImportAtomically({
          parsed,
          strategy,
          currentMap: cardMapRef.current,
          onProgress: progress,
        });

        // ── 6. In-memory sync after the tx commits ──
        cardMapRef.current = result2.nextMap;
        setCardMapState(() => result2.nextMap);
        bumpMapVersion();
        setCategoryRecords(result2.freshCategories);
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
        const lr = result2.legacyResolveReport;
        if (lr) {
          const okSum = lr.resolvedSubcategory + lr.resolvedChapter;
          const failSum = lr.unresolvedSubcategory + lr.unresolvedChapter;
          if (okSum > 0) extraParts.push(`mapirano ${okSum} legacy imena (${lr.resolvedSubcategory} podkat. + ${lr.resolvedChapter} glava)`);
          if (failSum > 0) extraParts.push(`bez para resetovano ${failSum} (${lr.unresolvedSubcategory} podkat. + ${lr.unresolvedChapter} glava)`);
        }
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
      } catch (err) {
        toast.error(`Greška pri uvozu: ${err instanceof Error ? err.message : "Neispravan format fajla."}`);
      }
    },
    [setCardMapState, setCategoryRecords, setReviewLog, updateSRSettings, cardMapRef],
  );

  // H5 fix: importCards now syncs cardMapRef before setState
  const importCards = useCallback(
    (newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
      const created = newCards.map((c) => createCard(c.question, c.sections, category));
      created.forEach((c) => { c.updatedAt = Date.now(); });
      const nextRef = { ...cardMapRef.current };
      created.forEach((c) => { nextRef[c.id] = c; });
      cardMapRef.current = nextRef;
      schedulePersist({ type: "bulk", cards: created });
      setCardMapState(() => nextRef);
      bumpMapVersion();
    },
    [setCardMapState, cardMapRef],
  );

  return { importData, importCards };
}
