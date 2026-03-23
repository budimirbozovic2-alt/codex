import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./index.css";
import { initColorTheme } from "./lib/app-settings";
import { db } from "./lib/db";

initColorTheme();

createRoot(document.getElementById("root")!).render(<App />);

// Splash removal is now fully driven by useCards hook (setReady → fade-out).
// Fallback: if data never loads within 8s, remove splash to avoid infinite loading.
setTimeout(() => {
  const splash = document.getElementById("app-splash");
  if (splash) {
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 400);
  }
}, 8000);

// ── Electron IPC: listen for backup-requested before quit ──
if (window.electronAPI) {
  const cleanup = window.electronAPI.onBackupRequested(async () => {
    try {
      const [cards, categories, subcategories, reviewLog, srSettings, sources, mindMaps] = await Promise.all([
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
      ]);
      const data: Record<string, unknown> = {
        version: 3,
        type: "full",
        cards,
        categories,
        subcategories,
        reviewLog,
        sources,
        mindMaps,
      };
      if (srSettings) data["srSettings"] = srSettings;
      const json = JSON.stringify(data, null, 2);
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
