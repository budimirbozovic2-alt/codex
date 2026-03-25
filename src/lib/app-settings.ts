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

export interface DashboardWidgetConfig {
  showExamProgress: boolean;
  showCoreStats: boolean;
  showBriefing: boolean;
  showIdealFocus: boolean;
  showVelocity: boolean;
  showWeakCategories: boolean;
  showStatusIcons: boolean;
  showProgressRing: boolean;
}

export interface PomodoroConfig {
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number; // every N work sessions
}

export interface NotificationConfig {
  enabled: boolean;
  reminderHour: number; // 0-23
  reminderMinute: number; // 0-59
}

export interface AppSettings {
  targetRetention: number;
  autoBackupDays: number;
  soundEffects: boolean;
  colorTheme: ColorTheme;
  dashboardWidgets: DashboardWidgetConfig;
  pomodoro: PomodoroConfig;
  notifications: NotificationConfig;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  targetRetention: 0.95,
  autoBackupDays: 7,
  soundEffects: false,
  colorTheme: "ocean",
  dashboardWidgets: {
    showExamProgress: true,
    showCoreStats: true,
    showBriefing: true,
    showIdealFocus: true,
    showVelocity: true,
    showWeakCategories: true,
    showStatusIcons: true,
    showProgressRing: true,
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
      dashboardWidgets: { ...DEFAULT_APP_SETTINGS.dashboardWidgets, ...parsed.dashboardWidgets },
      pomodoro: { ...DEFAULT_APP_SETTINGS.pomodoro, ...parsed.pomodoro },
      notifications: { ...DEFAULT_APP_SETTINGS.notifications, ...parsed.notifications },
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
  // IDB backup (fire-and-forget)
  try {
    import("./db").then(({ db }) => {
      db.settings.put({ key: "appSettings", value: settings }).catch((e) => console.warn("[silent]", e));
    });
  } catch {}
}

/** Load from IDB as fallback when localStorage is empty */
export async function loadAppSettingsAsync(): Promise<AppSettings> {
  try {
    const data = localStorage.getItem(APP_SETTINGS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return {
        ...DEFAULT_APP_SETTINGS,
        ...parsed,
        dashboardWidgets: { ...DEFAULT_APP_SETTINGS.dashboardWidgets, ...parsed.dashboardWidgets },
        pomodoro: { ...DEFAULT_APP_SETTINGS.pomodoro, ...parsed.pomodoro },
        notifications: { ...DEFAULT_APP_SETTINGS.notifications, ...parsed.notifications },
      };
    }
  } catch {}
  // Fallback to IDB
  try {
    const { db } = await import("./db");
    const row = await db.settings.get("appSettings");
    if (row?.value) {
      const parsed = row.value as Partial<AppSettings>;
      const restored = {
        ...DEFAULT_APP_SETTINGS,
        ...parsed,
        dashboardWidgets: { ...DEFAULT_APP_SETTINGS.dashboardWidgets, ...parsed.dashboardWidgets },
        pomodoro: { ...DEFAULT_APP_SETTINGS.pomodoro, ...parsed.pomodoro },
        notifications: { ...DEFAULT_APP_SETTINGS.notifications, ...parsed.notifications },
      };
      // Restore to localStorage for fast sync reads
      try { localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(restored)); } catch {}
      return restored;
    }
  } catch {}
  return { ...DEFAULT_APP_SETTINGS };
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

export function isAutoBackupOverdue(settings: AppSettings): boolean {
  if (settings.autoBackupDays <= 0) return false;
  const lastBackupStr = localStorage.getItem("sr-last-backup");
  if (!lastBackupStr) return false; // don't nag on first use
  const last = JSON.parse(lastBackupStr);
  if (!last || last === 0) return false;
  return Date.now() - last > settings.autoBackupDays * 24 * 60 * 60 * 1000;
}
