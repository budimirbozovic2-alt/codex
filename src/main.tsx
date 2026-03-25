import { markBootStep } from "./lib/boot-trace";
markBootStep("main:module-start");

// ── Register global error handlers FIRST, before any risky imports ──
const hideSplashImmediately = () => {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  splash.style.transition = "opacity 0.25s ease-out";
  splash.style.opacity = "0";
  setTimeout(() => splash.remove(), 300);
};

const showFatalBootError = (message: string) => {
  const root = document.getElementById("root");
  hideSplashImmediately();
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:hsl(217 33% 12%);color:hsl(210 40% 98%);font-family:Georgia, 'Times New Roman', serif;">
      <div style="max-width:640px;width:100%;border:1px solid hsl(0 72% 55% / 0.28);background:hsl(217 33% 14% / 0.96);border-radius:20px;padding:28px;box-shadow:0 20px 60px hsl(217 50% 4% / 0.35);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <div style="width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:hsl(0 72% 55% / 0.12);color:hsl(0 84% 68%);font-size:20px;">⚠</div>
          <div>
            <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:0.04em;">Greška pri pokretanju</h1>
            <p style="margin:4px 0 0;color:hsl(215 20% 72%);font-size:14px;">Aplikacija je prekinula inicijalizaciju.</p>
          </div>
        </div>
        <p style="margin:0 0 14px;line-height:1.6;color:hsl(210 40% 92%);white-space:pre-wrap;">${message.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))}</p>
        <p style="margin:0;color:hsl(215 20% 68%);font-size:13px;">Provjeri da li su svi fajlovi build-a prisutni i pokušaj ponovo pokrenuti aplikaciju.</p>
      </div>
    </div>
  `;
};

window.onerror = (_message, _source, _lineno, _colno, error) => {
  console.error("[boot] window.onerror", error || _message);
  showFatalBootError(error instanceof Error ? error.message : String(_message || "Nepoznata greška pri startu."));
};

window.onunhandledrejection = (event) => {
  const reason = event.reason;
  console.error("[boot] unhandledrejection", reason);
  showFatalBootError(reason instanceof Error ? reason.message : String(reason || "Unhandled promise rejection pri startu."));
};

markBootStep("main:error-handlers-registered");

// ── Splash fallback timeout — always runs even if imports fail ──
setTimeout(() => {
  hideSplashImmediately();
}, 5000);

// ── Guarded async bootstrap ──
(async () => {
  try {
    markBootStep("main:theme-init-start");
    const { initColorTheme } = await import("./lib/app-settings");
    initColorTheme();
    markBootStep("main:theme-init-done");

    markBootStep("main:app-import-start");
    const { default: App } = await import("./App");
    markBootStep("main:app-import-done");

    markBootStep("main:react-render-start");
    const { createRoot } = await import("react-dom/client");
    createRoot(document.getElementById("root")!).render(<App />);
    markBootStep("main:react-render-done");

    // Boot complete — replace destructive handlers with benign loggers
    // React ErrorBoundary now handles UI errors; these only catch non-React exceptions
    window.onerror = (_msg, _src, _ln, _col, err) => {
      console.error("[runtime] uncaught error", err || _msg);
    };
    window.onunhandledrejection = (event) => {
      console.error("[runtime] unhandled rejection", event.reason);
    };
  } catch (err) {
    console.error("[boot] bootstrap failed", err);
    markBootStep("main:bootstrap-error", err instanceof Error ? err.message : String(err));
    showFatalBootError(err instanceof Error ? err.message : String(err));
    return;
  }

  // ── Electron IPC: backup listener (lazy db import) ──
  if (window.electronAPI) {
    try {
      const { db } = await import("./lib/db");

      const buildBackupData = async () => {
        const [cards, categories, subcategories, reviewLog, srSettings, sources, mindMaps, diary, calibrationLog, latencyLog, slippageLog, activityLog, disciplineLog, pomodoroLog] = await Promise.all([
          db.cards.toArray(),
          db.categories.toArray().then(rows => rows.map(r => r.name)),
          db.subcategories.toArray().then(rows => {
            const result: Record<string, string[]> = {};
            rows.forEach(r => { result[r.category] = r.subs; });
            return result;
          }),
          db.reviewLog.toArray(),
          db.settings.get("srSettings").then(r => r?.value ?? null),
          db.sources.toArray(),
          db.mindMaps.toArray(),
          db.diary.toArray(),
          db.calibrationLog.toArray(),
          db.latencyLog.toArray(),
          db.slippageLog.toArray(),
          db.activityLog.toArray(),
          db.disciplineLog.toArray(),
          db.pomodoroLog.toArray(),
        ]);

        // Read planner data from IDB (not stale localStorage)
        const [plannerConfigRow, dailyMappedRow, dailyMappedDateRow] = await Promise.all([
          db.settings.get("plannerConfig"),
          db.settings.get("dailyMapped"),
          db.settings.get("dailyMappedDate"),
        ]);

        const localStorageData: Record<string, unknown> = {};
        if (plannerConfigRow?.value) localStorageData["sr-planner-config"] = plannerConfigRow.value;
        if (dailyMappedRow?.value != null) localStorageData["sr-daily-mapped-count"] = dailyMappedRow.value;
        if (dailyMappedDateRow?.value) localStorageData["sr-daily-mapped-date"] = dailyMappedDateRow.value;

        const lsKeys = [
          "sr-app-settings", "sr-mnemonic-workshop",
          "sr-mnemonic-associations", "sr-major-system-map",
          "sr-learn-progress", "sr-last-backup",
        ];
        for (const key of lsKeys) {
          const val = localStorage.getItem(key);
          if (val !== null) {
            try { localStorageData[key] = JSON.parse(val); } catch { localStorageData[key] = val; }
          }
        }

        const data: Record<string, unknown> = {
          version: 4, type: "full",
          cards, categories, subcategories, reviewLog,
          sources, mindMaps,
          diary, calibrationLog, latencyLog, slippageLog, activityLog, disciplineLog, pomodoroLog,
          localStorageData,
        };
        if (srSettings) data["srSettings"] = srSettings;
        return JSON.stringify(data);
      };

      // Register periodic backup-requested listener
      const cleanup = window.electronAPI.onBackupRequested(async () => {
        try {
          const json = await buildBackupData();
          window.electronAPI!.requestBackup(json);
        } catch (_) {}
      });

      // Register quit-backup listener (IPC pattern, no executeJavaScript)
      // CRITICAL: notifyQuitBackupDone MUST always be called or Electron hangs on quit
      const api = window.electronAPI as any;
      const cleanupQuit = api.onQuitBackupRequested?.(async () => {
        try {
          const json = await Promise.race([
            buildBackupData(),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("quit-backup-timeout")), 5000)
            ),
          ]);
          await window.electronAPI!.requestBackup(json);
        } catch (err) {
          console.error("[quit-backup] failed, releasing lock:", err);
        } finally {
          api.notifyQuitBackupDone?.();
        }
      });

      const doCleanup = () => { cleanup(); cleanupQuit?.(); };
      window.addEventListener("beforeunload", doCleanup);
      window.addEventListener("unload", doCleanup);
    } catch {}
  }
})();

// ── Service Worker registration ──
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    if (!import.meta.env.PROD) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      return;
    }
    navigator.serviceWorker.register("./sw.js");
  });
}
