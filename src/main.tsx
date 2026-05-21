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
  console.error("[boot] unhandledrejection", event.reason);
};

markBootStep("main:error-handlers-registered");

// ── Guarded async bootstrap ──
(async () => {
  try {
    markBootStep("main:parallel-import-start");
    const [{ initColorTheme }, { default: App }, { createRoot }, { eventBus }, { setDbEventEmitter }, { initCardMapInvalidator }] = await Promise.all([
      import("./lib/app-settings"),
      import("./App"),
      import("react-dom/client"),
      import("./lib/event-bus"),
      import("./lib/db-schema"),
      import("./lib/repositories/cardMapInvalidator"),
    ]);
    markBootStep("main:parallel-import-done");

    // W1: Inject EventBus into db-schema (Inversion of Control — breaks the
    // db-schema ↔ event-bus circular dependency).
    setDbEventEmitter(
      (type, payload) => eventBus.emit(type, payload),
      () => eventBus.getTabCount(),
    );

    // Phase 3 — cardMap is now an invalidatable cache. Subscribe once at
    // boot so external CARDS_UPDATED emitters (HealthMonitor, RemapFromBackup,
    // future remote sync) re-hydrate RAM without depending on React mount.
    initCardMapInvalidator();

    initColorTheme();
    markBootStep("main:theme-init-done");

    markBootStep("main:react-render-start");
    createRoot(document.getElementById("root")!).render(<App />);
    markBootStep("main:react-render-done");

    window.onerror = (_msg, _src, _ln, _col, err) => {
      console.error("[runtime] uncaught error", err || _msg);
    };
    // ── Electron IPC Setup ──
    if (window.electronAPI) {
      import("./lib/electron-integration").then(({ setupElectronIPC }) => {
        setupElectronIPC().catch(e => console.warn("[boot] Electron IPC setup failed", e));
      });
    }
  } catch (err) {
    console.error("[boot] bootstrap failed", err);
    markBootStep("main:bootstrap-error", err instanceof Error ? err.message : String(err));
    showFatalBootError(err instanceof Error ? err.message : String(err));
    return;
  }
})();

// ── Service Worker registration ──
if ("serviceWorker" in navigator && !window.electronAPI) {
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