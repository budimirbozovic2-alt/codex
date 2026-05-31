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

// ── Web build deprecation (A1c finale) ──
// Pure Desktop: PROD browser builds short-circuit to a branded CTA instead
// of attempting to mount React or touch SQLite. Dev keeps full app for
// `bun run dev` workflow. `assertDesktop` inside the bootstrap remains as
// defense-in-depth.
const isDesktopShell =
  typeof window !== "undefined" && Boolean((window as { electronAPI?: unknown }).electronAPI);

function renderDesktopOnlyCta(): void {
  const splash = document.getElementById("app-splash");
  if (splash) splash.remove();
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <main style="
      min-height:100vh;
      display:flex;align-items:center;justify-content:center;
      padding:32px;
      background:radial-gradient(ellipse at center, #152238 0%, #0a1628 100%);
      font-family:'Segoe UI', system-ui, -apple-system, sans-serif;
      color:#e0e7ff;
    ">
      <article style="
        max-width:560px;width:100%;
        background:rgba(20,32,56,0.72);
        border:1px solid rgba(99,131,201,0.22);
        border-radius:24px;
        padding:48px 40px;
        box-shadow:0 24px 80px rgba(0,0,0,0.45);
        text-align:center;
      ">
        <img src="./app-logo-favicon.png" alt="CODEX" width="72" height="72"
             style="display:block;margin:0 auto 24px;border-radius:16px;" />
        <h1 style="margin:0 0 12px;font-size:30px;font-weight:700;letter-spacing:0.01em;color:#f4f6ff;">
          CODEX je desktop aplikacija
        </h1>
        <p style="margin:0 0 28px;line-height:1.6;font-size:16px;color:#b8c4e3;">
          Web verzija je deprecated. Preuzmi desktop build za pun pristup
          OPFS SQLite bazi, offline radu i Electron sigurnosnom sloju.
        </p>
        <a href="https://github.com/budimirbozovic2-alt/memoria-mne/releases/latest"
           target="_blank" rel="noopener noreferrer"
           style="
             display:inline-block;
             padding:14px 28px;
             background:linear-gradient(135deg,#3b6fa0 0%,#1e3a5f 100%);
             color:#f4f6ff;
             text-decoration:none;
             font-weight:600;
             font-size:15px;
             letter-spacing:0.02em;
             border-radius:12px;
             box-shadow:0 8px 24px rgba(30,58,95,0.5);
             transition:transform 0.15s ease, box-shadow 0.15s ease;
           "
           onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 12px 32px rgba(30,58,95,0.6)';"
           onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 8px 24px rgba(30,58,95,0.5)';">
          Preuzmi za desktop
        </a>
        <p style="margin:24px 0 0;font-size:13px;color:#8a9bc4;">
          <a href="https://github.com/budimirbozovic2-alt/memoria-mne/releases/latest"
             target="_blank" rel="noopener noreferrer"
             style="color:#8a9bc4;text-decoration:underline;">
            Saznaj više o desktop verziji
          </a>
        </p>
      </article>
    </main>
  `;
  document.title = "CODEX — Preuzmi za desktop";
}

if (!isDesktopShell && import.meta.env.PROD) {
  renderDesktopOnlyCta();
  // Halt all further bootstrap — no React, no SQLite, no electron IPC.
} else {

// ── Guarded async bootstrap ──
// Outer `isDesktopShell && PROD` guard above already short-circuits browser
// builds to the download CTA, so the previous defense-in-depth
// `await import("./lib/electron-integration"); assertDesktop()` was redundant
// (Wave 4.8). Bootstrap proceeds straight to the parallel module import.
(async () => {
  try {
    markBootStep("main:parallel-import-start");
    const [{ initColorTheme }, { default: App }, { createRoot }, { eventBus }, { setDbEventEmitter }] = await Promise.all([
      import("./lib/app-settings"),
      import("./App"),
      import("react-dom/client"),
      import("./lib/event-bus"),
      import("./lib/db-error"),
    ]);
    markBootStep("main:parallel-import-done");

    // W1: Inject EventBus into db-schema (Inversion of Control — breaks the
    // db-schema ↔ event-bus circular dependency). Only DB infrastructure
    // events (DB_BLOCKED / DB_UNBLOCKED / DB_ERROR_CHANGED) still flow
    // through the bus — domain events have all migrated to direct Zustand
    // store calls.
    setDbEventEmitter(
      (type, payload) => eventBus.emit(type, payload),
      () => eventBus.getTabCount(),
    );


    initColorTheme();
    markBootStep("main:theme-init-done");

    markBootStep("main:react-render-start");
    createRoot(document.getElementById("root")!).render(<App />);
    markBootStep("main:react-render-done");

    // Wave-2 fix: the splash retry signal is now set inside
    // `useCardBootstrap`'s finally block, after React truly mounts and the
    // boot DAG resolves. Setting it here was premature — React 18's render
    // is async and the flag fired before any effect or first commit. The
    // splash timer stays armed in index.html and is cleared from the boot
    // hook once `setReady(true)` runs.

    window.onerror = (_msg, _src, _ln, _col, err) => {
      console.error("[runtime] uncaught error", err || _msg);
    };

    // Task Scheduler lifecycle — shut down all pending centralized timers on
    // unload so no IDB write fires after the page is gone. Idempotent.
    const { taskScheduler } = await import("./lib/scheduler");
    window.addEventListener("beforeunload", () => taskScheduler.shutdown());

    // ── Electron IPC Setup ──
    if (window.electronAPI) {
      import("./lib/electron-integration").then(({ setupElectronIPC }) => {
        setupElectronIPC().catch(e => console.warn("[boot] Electron IPC setup failed", e));
        if (typeof window.electronAPI?.onBeforeQuit === "function") {
          window.electronAPI.onBeforeQuit(() => taskScheduler.shutdown());
        }
      });
    }
  } catch (err) {
    console.error("[boot] bootstrap failed", err);
    markBootStep("main:bootstrap-error", err instanceof Error ? err.message : String(err));
    showFatalBootError(err instanceof Error ? err.message : String(err));
    return;
  }
})();

} // end web-CTA-guard else block

// ── Service Worker cleanup (Pure Desktop — P3 PR-8 finale) ──
// We no longer register a service worker. This block remains for one release
// to unregister stale SWs from any user who installed a previous web build.
// Scheduled for full removal in PR-9.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* no-op — desktop shell has no SW anyway */
    }
  });
}