import { logger } from "@/lib/logger";
import { putSetting } from "@/lib/db/queries";
import { parseAppLocale, type AppLocale } from "@/i18n/types";

const APP_SETTINGS_KEY = "sr-app-settings";

export type ColorTheme = "amber" | "slate" | "forest" | "ocean" | "rose" | "midnight";

export const COLOR_THEMES: { id: ColorTheme; label: string; preview: string }[] = [
  { id: "amber", label: "Ćilibar", preview: "hsl(38, 75%, 48%)" },
  { id: "slate", label: "Čelik", preview: "hsl(215, 20%, 35%)" },
  { id: "forest", label: "Šuma", preview: "hsl(152, 50%, 32%)" },
  { id: "ocean", label: "Okean", preview: "hsl(210, 65%, 42%)" },
  { id: "rose", label: "Ruža", preview: "hsl(346, 55%, 45%)" },
  { id: "midnight", label: "Ponoć", preview: "hsl(245, 50%, 48%)" },
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

export function loadAppSettings(): AppSettings {
  try {
    const data = localStorage.getItem(APP_SETTINGS_KEY);
    if (!data) return { ...DEFAULT_APP_SETTINGS };
    const parsed = JSON.parse(data);
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      locale: parseAppLocale(parsed.locale),
      dashboardWidgets: { ...DEFAULT_APP_SETTINGS.dashboardWidgets, ...parsed.dashboardWidgets },
      pomodoro: { ...DEFAULT_APP_SETTINGS.pomodoro, ...parsed.pomodoro },
      notifications: { ...DEFAULT_APP_SETTINGS.notifications, ...parsed.notifications },
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
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
  const json = JSON.stringify(settings);
  // Mirror to localStorage first for fast sync reads (cache, not SSOT).
  try { localStorage.setItem(APP_SETTINGS_KEY, json); } catch { /* noop */ }
  // PR-G1 / C-2 final: await the SSOT write and re-throw on failure so the
  // caller (UI toast) can react. Previously the `.catch(logger.error)`
  // swallowed the rejection — localStorage mirror gave false-success even
  // when SQLite write was dropped (data survives only until cache wipe).
  try {
    await putSetting("appSettings", settings);
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
  // Restore dark mode preference
  const darkPref = localStorage.getItem("sr-dark-mode");
  if (darkPref === "true" || (!darkPref && true)) {
    // Default to dark mode if no preference saved
    document.documentElement.classList.add("dark");
  }
}

export function setDarkMode(dark: boolean): void {
  localStorage.setItem("sr-dark-mode", String(dark));
  if (dark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}
