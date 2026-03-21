import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Fade out in-app splash
requestAnimationFrame(() => {
  const splash = document.getElementById("app-splash");
  if (splash) {
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 400);
  }
});

// ── Electron IPC: listen for backup-requested before quit ──
if (window.electronAPI) {
  const cleanup = window.electronAPI.onBackupRequested(() => {
    try {
      const keys = ['sr-essay-cards', 'sr-essay-categories', 'sr-essay-subcategories', 'sr-review-log', 'sr-settings'];
      const data: Record<string, unknown> = {};
      keys.forEach(k => {
        const v = localStorage.getItem(k);
        if (v) data[k] = JSON.parse(v);
      });
      const json = JSON.stringify(data, null, 2);
      window.electronAPI!.requestBackup(json);
    } catch (_) {}
  });

  // Cleanup on page unload to prevent memory leaks
  window.addEventListener("beforeunload", () => cleanup());
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

    navigator.serviceWorker.register("/sw.js");
  });
}
