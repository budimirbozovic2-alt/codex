/**
 * Legacy backup `localStorageData` ↔ SQLite SSOT bridge (Faza 4).
 *
 * Export still emits `localStorageData` for backward-compatible backups, but
 * values are read from SQLite. Import writes into SQLite/KV/tables instead of
 * `localStorage.setItem`.
 */
import type { LearnCardProgress } from "@/lib/types/logs";
import {
  getSetting,
  putSetting,
  replaceAllLearnProgress,
  saveDailyMapped,
  savePlannerConfig,
} from "@/lib/db/queries";
import { dailyMappedCache, plannerCache } from "@/domains/planner/cache";
import { DEFAULT_CONFIG } from "@/domains/planner/types";
import type { PlannerConfig } from "@/domains/planner/types";
import { initAppSettingsCache, mergeAppSettings, type AppSettings } from "@/lib/app-settings";
import { writePref } from "@/lib/query/prefs-cache-coordinator";
import type { TTSSettings } from "@/lib/tts";
import { logger } from "@/lib/logger";

/** Keys allowed in backup `localStorageData` roundtrip. */
export const LEGACY_LS_EXPORT_KEYS = [
  "sr-app-settings",
  "sr-mnemonic-workshop",
  "sr-mnemonic-associations",
  "sr-major-system-map",
  "sr-learn-progress",
  "sr-last-backup",
  "sr-planner-config",
  "sr-daily-mapped-count",
  "sr-daily-mapped-date",
  "sr-dark-mode",
  "sr-tts-settings",
] as const;

function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Build legacy-shaped `localStorageData` from SQLite SSOT. */
export async function exportLegacyLocalStorageData(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  const [
    appSettings,
    plannerConfig,
    dailyMapped,
    learnProgress,
    lastBackup,
    darkMode,
    ttsSettings,
    mnemonicWorkshop,
    mnemonicAssociations,
    majorSystemMap,
  ] = await Promise.all([
    getSetting<AppSettings>("appSettings"),
    getSetting<unknown>("plannerConfig"),
    getSetting<{ date: string; count: number }>("dailyMapped"),
    import("@/lib/db/queries").then((m) => m.loadAllLearnProgress()),
    getSetting<number>("sr-last-backup"),
    getSetting<boolean>("darkMode"),
    getSetting<TTSSettings>("sr-tts-settings"),
    getSetting<unknown>("sr-mnemonic-workshop"),
    getSetting<unknown>("sr-mnemonic-associations"),
    getSetting<unknown>("sr-major-system-map"),
  ]);

  if (appSettings) out["sr-app-settings"] = appSettings;
  if (plannerConfig) out["sr-planner-config"] = plannerConfig;
  if (dailyMapped) {
    out["sr-daily-mapped-count"] = dailyMapped.count;
    out["sr-daily-mapped-date"] = dailyMapped.date;
  }
  if (learnProgress && Object.keys(learnProgress).length > 0) {
    out["sr-learn-progress"] = learnProgress;
  }
  if (lastBackup && lastBackup > 0) out["sr-last-backup"] = lastBackup;
  if (darkMode !== undefined) out["sr-dark-mode"] = String(darkMode);
  if (ttsSettings) out["sr-tts-settings"] = ttsSettings;
  if (mnemonicWorkshop) out["sr-mnemonic-workshop"] = mnemonicWorkshop;
  if (mnemonicAssociations) out["sr-mnemonic-associations"] = mnemonicAssociations;
  if (majorSystemMap) out["sr-major-system-map"] = majorSystemMap;

  return out;
}

async function importLearnProgress(value: unknown): Promise<void> {
  if (!value || typeof value !== "object") return;
  await replaceAllLearnProgress(value as Record<string, LearnCardProgress>);
  try {
    localStorage.removeItem("sr-learn-progress");
  } catch {
    /* private mode */
  }
}

/** Apply one legacy backup entry into SQLite SSOT. */
export async function importLegacyLocalStorageEntry(
  key: string,
  value: unknown,
): Promise<void> {
  switch (key) {
    case "sr-app-settings": {
      const merged = mergeAppSettings(value as Partial<AppSettings>);
      await putSetting("appSettings", merged);
      await initAppSettingsCache();
      break;
    }
    case "sr-planner-config": {
      const next = { ...DEFAULT_CONFIG, ...(value as Partial<PlannerConfig>) };
      await savePlannerConfig(next);
      plannerCache.set(next);
      break;
    }
    case "sr-daily-mapped-count":
    case "sr-daily-mapped-date":
      break;
    case "sr-learn-progress":
      await importLearnProgress(value);
      break;
    case "sr-last-backup":
      if (typeof value === "number") await putSetting("sr-last-backup", value);
      try {
        localStorage.removeItem("sr-last-backup");
      } catch {
        /* private mode */
      }
      break;
    case "sr-dark-mode": {
      const dark = value === true || value === "true";
      writePref("darkMode", dark);
      break;
    }
    case "sr-tts-settings":
      writePref("sr-tts-settings", value as TTSSettings);
      break;
    case "sr-mnemonic-workshop":
    case "sr-mnemonic-associations":
    case "sr-major-system-map":
      await putSetting(key, value);
      break;
    default:
      logger.debug("[legacy-ls-import] skipped unknown key", key);
  }
}

/** Merge paired daily-mapped legacy keys after per-key import pass. */
export async function finalizeLegacyDailyMappedImport(
  data: Record<string, unknown>,
): Promise<void> {
  const dateRaw = data["sr-daily-mapped-date"];
  const countRaw = data["sr-daily-mapped-count"];
  if (dateRaw == null && countRaw == null) return;

  const date = typeof dateRaw === "string" ? dateRaw : "";
  const count =
    typeof countRaw === "number"
      ? countRaw
      : typeof countRaw === "string"
        ? Number.parseInt(countRaw, 10) || 0
        : 0;
  const slot = { date, count };
  dailyMappedCache.set(slot);
  await saveDailyMapped(slot);
}

/** One-shot renderer boot migration for keys still in browser localStorage. */
export async function migrateBrowserLocalStorageToSqlite(): Promise<void> {
  const dailyDate = localStorage.getItem("sr-daily-mapped-date");
  const dailyCount = localStorage.getItem("sr-daily-mapped-count");

  for (const key of LEGACY_LS_EXPORT_KEYS) {
    if (key === "sr-daily-mapped-count" || key === "sr-daily-mapped-date") continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const value = parseJsonValue(raw);
      await importLegacyLocalStorageEntry(key, value);
      localStorage.removeItem(key);
    } catch (err) {
      logger.warn("[legacy-ls-migrate] failed", { key, err });
    }
  }
  if (dailyDate !== null || dailyCount !== null) {
    try {
      await finalizeLegacyDailyMappedImport({
        "sr-daily-mapped-date": dailyDate ?? undefined,
        "sr-daily-mapped-count":
          dailyCount != null ? parseJsonValue(dailyCount) : undefined,
      });
      localStorage.removeItem("sr-daily-mapped-date");
      localStorage.removeItem("sr-daily-mapped-count");
    } catch (err) {
      logger.warn("[legacy-ls-migrate] dailyMapped failed", err);
    }
  }
}
