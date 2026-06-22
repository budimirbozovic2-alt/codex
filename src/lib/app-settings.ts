import { logger } from "@/lib/logger";
import { getSetting, putSetting } from "@/lib/db/queries";
import { readPref, writePref } from "@/lib/query/prefs-cache-coordinator";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { parseAppLocale, type AppLocale } from "@/i18n/types";

const APP_SETTINGS_KEY = "sr-app-settings";
const SQLITE_APP_SETTINGS_KEY = "appSettings";

export type ColorTheme = "amber" | "slate" | "forest" | "ocean" | "rose" | "midnight";

export interface ColorThemeOption {
  id: ColorTheme;
  label: string;
  subtitle: string;
  preview: string;
  previewAccent: string;
}

export const COLOR_THEMES: ColorThemeOption[] = [
  {
    id: "ocean",
    label: "Plava tišina",
    subtitle: "Smirena i jasna — preporučena",
    preview: "hsl(208, 72%, 42%)",
    previewAccent: "hsl(175, 55%, 42%)",
  },
  {
    id: "amber",
    label: "Topla zlatna",
    subtitle: "Za dugotrajnu koncentraciju",
    preview: "hsl(38, 78%, 50%)",
    previewAccent: "hsl(32, 85%, 58%)",
  },
  {
    id: "slate",
    label: "Neutralna siva",
    subtitle: "Čist, profesionalan izgled",
    preview: "hsl(220, 22%, 32%)",
    previewAccent: "hsl(200, 55%, 45%)",
  },
  {
    id: "forest",
    label: "Prirodna zelena",
    subtitle: "Opuštajuća šumska paleta",
    preview: "hsl(155, 48%, 32%)",
    previewAccent: "hsl(38, 70%, 48%)",
  },
  {
    id: "rose",
    label: "Breskva",
    subtitle: "Mekana topla nijansa",
    preview: "hsl(350, 52%, 48%)",
    previewAccent: "hsl(25, 75%, 58%)",
  },
  {
    id: "midnight",
    label: "Indigo noć",
    subtitle: "Duboki ljubičasti akcenti",
    preview: "hsl(248, 52%, 46%)",
    previewAccent: "hsl(270, 55%, 62%)",
  },
];

interface DashboardWidgetConfig {
  showExamProgress: boolean;
  showCoreStats: boolean;
  showBriefing: boolean;
  showIdealFocus: boolean;
  showVelocity: boolean;
  showWeakCategories: boolean;
  showStatusIcons: boolean;
  showProgressRing: boolean;
  showHeatmap: boolean;
}

interface PomodoroConfig {
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number; // every N work sessions
}

interface NotificationConfig {
  enabled: boolean;
  reminderHour: number; // 0-23
  reminderMinute: number; // 0-59
}

export interface AppSettings {
  targetRetention: number;
  autoBackupDays: number;
  soundEffects: boolean;
  colorTheme: ColorTheme;
  locale: AppLocale;
  dashboardWidgets: DashboardWidgetConfig;
  pomodoro: PomodoroConfig;
  notifications: NotificationConfig;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  targetRetention: 0.95,
  autoBackupDays: 7,
  soundEffects: false,
  colorTheme: "ocean",
  locale: "me",
  dashboardWidgets: {
    showExamProgress: true,
    showCoreStats: true,
    showBriefing: true,
    showIdealFocus: true,
    showVelocity: true,
    showWeakCategories: true,
    showStatusIcons: true,
    showProgressRing: true,
    showHeatmap: true,
  },
  pomodoro: {
    workMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    longBreakInterval: 4,
  },
  notifications: {
    enabled: false,
    reminderHour: 9,
    reminderMinute: 0,
  },
};

export function mergeAppSettings(
  parsed: Partial<AppSettings> | null | undefined,
): AppSettings {
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_APP_SETTINGS };
  return {
    ...DEFAULT_APP_SETTINGS,
    ...parsed,
    locale: parseAppLocale(parsed.locale),
    dashboardWidgets: {
      ...DEFAULT_APP_SETTINGS.dashboardWidgets,
      ...parsed.dashboardWidgets,
    },
    pomodoro: { ...DEFAULT_APP_SETTINGS.pomodoro, ...parsed.pomodoro },
    notifications: {
      ...DEFAULT_APP_SETTINGS.notifications,
      ...parsed.notifications,
    },
  };
}

function loadAppSettingsFromLocalStorage(): AppSettings {
  try {
    const data = localStorage.getItem(APP_SETTINGS_KEY);
    if (!data) return { ...DEFAULT_APP_SETTINGS };
    return mergeAppSettings(JSON.parse(data) as Partial<AppSettings>);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/** Hydrate TanStack app settings from SQLite (boot). Migrates legacy localStorage once. */
export async function initAppSettingsCache(): Promise<void> {
  try {
    const stored = await getSetting<Partial<AppSettings>>(SQLITE_APP_SETTINGS_KEY);
    if (stored) {
      queryClient.setQueryData(
        queryKeys.settings.app(),
        mergeAppSettings(stored),
      );
      return;
    }
    const fromLs = loadAppSettingsFromLocalStorage();
    if (localStorage.getItem(APP_SETTINGS_KEY) !== null) {
      await putSetting(SQLITE_APP_SETTINGS_KEY, fromLs);
      try {
        localStorage.removeItem(APP_SETTINGS_KEY);
      } catch {
        /* private mode */
      }
    }
    queryClient.setQueryData(queryKeys.settings.app(), fromLs);
  } catch (err) {
    logger.warn("[app-settings] cache init failed", err);
    queryClient.setQueryData(
      queryKeys.settings.app(),
      loadAppSettingsFromLocalStorage(),
    );
  }
}

export function loadAppSettings(): AppSettings {
  return (
    queryClient.getQueryData<AppSettings>(queryKeys.settings.app())
    ?? { ...DEFAULT_APP_SETTINGS }
  );
}

/**
 * PR-G3 (RC-3): same-tab refresh signal. The DOM `storage` event only
 * fires in OTHER tabs/windows, so a Pure Desktop single-window app would
 * never notify in-tab listeners (e.g. `useDashboardData`) after a settings
 * write. Listeners now subscribe to this custom event in addition to (or
 * instead of) `storage` to pick up same-tab changes.
 */
export const APP_SETTINGS_CHANGED_EVENT = "sr-app-settings-changed";

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  queryClient.setQueryData(queryKeys.settings.app(), settings);
  try {
    await putSetting(SQLITE_APP_SETTINGS_KEY, settings);
    try {
      localStorage.removeItem(APP_SETTINGS_KEY);
    } catch {
      /* private mode */
    }
  } catch (err) {
    logger.error("[settings] put failed — SSOT write lost", err);
    throw err;
  }
  // PR-G3: broadcast in-tab so listeners refresh without needing a reload.
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(APP_SETTINGS_CHANGED_EVENT));
    }
  } catch { /* noop */ }
}

export function applyColorTheme(theme: ColorTheme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function initColorTheme(): void {
  const settings = loadAppSettings();
  applyColorTheme(settings.colorTheme);
  const legacyDark = localStorage.getItem("sr-dark-mode");
  if (legacyDark !== null) {
    writePref("darkMode", legacyDark === "true");
    try {
      localStorage.removeItem("sr-dark-mode");
    } catch {
      /* private mode */
    }
  }
  const darkPref = readPref<boolean | string>("darkMode", true);
  const dark = darkPref === true || darkPref === "true";
  document.documentElement.classList.toggle("dark", dark);
}

export function setDarkMode(dark: boolean): void {
  writePref("darkMode", dark);
  document.documentElement.classList.toggle("dark", dark);
}
