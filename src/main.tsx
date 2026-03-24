import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initColorTheme } from "./lib/app-settings";
import { db } from "./lib/db";

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
            <p style="margin:4px 0 0;color:hsl(215 20% 72%);font-size:14px;">Aplikacija je prekinula inicijalizaciju prije učitavanja interfejsa.</p>
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

initColorTheme();

createRoot(document.getElementById("root")!).render(<App />);

// Splash removal is now fully driven by useCards hook (setReady → fade-out).
// Fallback: if data never loads within 8s, remove splash to avoid infinite loading.
setTimeout(() => {
  hideSplashImmediately();
}, 5000);

// ── Electron IPC: listen for backup-requested before quit ──
if (window.electronAPI) {
  const cleanup = window.electronAPI.onBackupRequested(async () => {
    try {
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

      // Collect key localStorage items
      const localStorageData: Record<string, unknown> = {};
      const lsKeys = [
        "sr-planner-config", "sr-app-settings", "sr-mnemonic-workshop",
        "sr-mnemonic-associations", "sr-major-system-map",
        "sr-daily-mapped-count", "sr-daily-mapped-date",
        "sr-learn-progress", "sr-last-backup",
      ];
      for (const key of lsKeys) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          try { localStorageData[key] = JSON.parse(val); } catch { localStorageData[key] = val; }
        }
      }

      const data: Record<string, unknown> = {
        version: 4,
        type: "full",
        cards, categories, subcategories, reviewLog,
        sources, mindMaps,
        diary, calibrationLog, latencyLog, slippageLog, activityLog, disciplineLog, pomodoroLog,
        localStorageData,
      };
      if (srSettings) data["srSettings"] = srSettings;
      const json = JSON.stringify(data);
      window.electronAPI!.requestBackup(json);
    } catch (_) {}
  });

  // Cleanup on page unload — use both 'beforeunload' and 'unload' for reliability
  const doCleanup = () => cleanup();
  window.addEventListener("beforeunload", doCleanup);
  window.addEventListener("unload", doCleanup);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    // U preview/dev modu SW često kešira zastarjele assete i može dati bijeli ekran.
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
