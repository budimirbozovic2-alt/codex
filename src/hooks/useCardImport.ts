import { useCallback } from "react";

import { toast } from "sonner";

import { createCard, type Card as SpacedCard } from "@/lib/spaced-repetition";

import type { EditorDoc } from "@/lib/editor-v4/types";

import type { PreparedImport } from "@/components/export-import/types";

import { isLegacyEmergencyExport } from "@/lib/backup/emergency-import";

import { yieldUI } from "@/lib/backup/yield-ui";

import { applyImportAtomically, type ImportStrategy } from "@/lib/backup/import-transaction";

import { clearReviewSession } from "@/domains/review/review-session-storage";

import {

  bulkPutCardsDirect,

  listAllCards,

} from "@/lib/db/queries";

import {
  abortAllCachesWrite,
  beginAllCachesWrite,
  commitAllCachesFromDb,
} from "@/lib/query/all-caches-coordinator";

import { APP_SETTINGS_CHANGED_EVENT } from "@/lib/app-settings";
import {
  finalizeLegacyDailyMappedImport,
  importLegacyLocalStorageEntry,
  LEGACY_LS_EXPORT_KEYS,
} from "@/lib/backup/legacy-local-storage";
import { logger } from "@/lib/logger";

export type ImportProgress = (pct: number, label: string) => void;

const ALLOWED_LS_KEYS = new Set<string>(LEGACY_LS_EXPORT_KEYS);

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
  const importData = useCallback(

    async (

      prepared: PreparedImport,

      strategy: ImportStrategy = "keep",

      onProgress?: ImportProgress,

    ): Promise<void> => {

      const progress: ImportProgress = onProgress ?? (() => { /* noop */ });

      const { parsed, raw } = prepared;



      if (parsed.cards.length === 0 && parsed.categories.length === 0) {

        const msg = "Fajl ne sadrži kartice ni kategorije za uvoz.";

        toast.error(msg);

        throw new Error(msg);

      }



      progress(25, "Priprema podataka…");

      const needsReviewWrite =
        strategy === "overwrite" && parsed.reviewLog.length > 0;
      const cacheSession = beginAllCachesWrite({ reviewLog: needsReviewWrite });
      let writeCommitted = false;

      try {
        const allCards = await listAllCards();
        const baseline: Record<string, SpacedCard> = {};
        for (const c of allCards) baseline[c.id] = c;

        const result2 = await applyImportAtomically({
          parsed,
          strategy,
          currentMap: baseline,
          onProgress: progress,
        });

        progress(92, "Sinhronizacija keša…");

        await commitAllCachesFromDb(cacheSession, {
          freshCategories: result2.freshCategories,
          srSettings: result2.srSettingsApplied,
          syncReviewLog: result2.reviewLogApplied !== null,
          satellites: "import",
        });

        writeCommitted = true;

        if (parsed.localStorageData && typeof parsed.localStorageData === "object") {
          const lsData = parsed.localStorageData as Record<string, unknown>;
          for (const [key, value] of Object.entries(lsData)) {
            if (!ALLOWED_LS_KEYS.has(key)) continue;
            if (key === "sr-daily-mapped-count" || key === "sr-daily-mapped-date") continue;
            try {
              const parsedVal = typeof value === "string" ? JSON.parse(value) : value;
              const clean = sanitizeLSValue(parsedVal);
              await importLegacyLocalStorageEntry(key, clean);
            } catch {
              if (typeof value === "string" && !/[<>]/.test(value)) {
                await importLegacyLocalStorageEntry(key, value);
              }
            }
          }
          await finalizeLegacyDailyMappedImport(lsData);
          window.dispatchEvent(new Event(APP_SETTINGS_CHANGED_EVENT));
        }

        if (strategy === "overwrite") {
          clearReviewSession();
        }

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
        const kind = parsed.type === "template"
          ? "template"
          : isLegacyEmergencyExport(raw)
            ? "hitni backup"
            : "backup";
        toast.success(`Uspješno uvezen ${kind}: ${result2.merged.length} kartica${extraMsg}.`);
      } catch (err) {
        const msg = `Greška pri uvozu: ${err instanceof Error ? err.message : "import failed."}`;
        toast.error(msg);
        logger.error("[useCardImport] import failed", err);
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        if (!writeCommitted) {
          await abortAllCachesWrite(cacheSession);
        }
      }

    },

    [],

  );



  const importCards = useCallback(

    async (

      newCards: { question: string; sections: { title: string; contentDoc: EditorDoc }[] }[],

      category: string,

    ) => {

      const created = newCards.map((c) =>

        createCard(c.question, c.sections, category),

      );

      const now = Date.now();

      created.forEach((c) => { c.updatedAt = now; });

      if (created.length > 0) {
        const session = beginAllCachesWrite({ categories: false });
        let cacheCommitted = false;
        try {
          await bulkPutCardsDirect(created, { skipNotify: true });
          await commitAllCachesFromDb(session);
          cacheCommitted = true;
        } finally {
          if (!cacheCommitted) {
            await abortAllCachesWrite(session);
          }
        }
      }

    },

    [],

  );



  return { importData, importCards };

}


