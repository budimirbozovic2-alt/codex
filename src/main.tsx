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
  // PR-H1: route through logger to keep the prod-suppression contract
  // consistent (Vite esbuild.pure does not tree-shake console.error
  // reliably across all bundlers).
  void import("./lib/logger").then(({ logger }) => {
    logger.error("[boot] window.onerror", error || _message);
  });
  showFatalBootError(error instanceof Error ? error.message : String(_message || "Nepoznata greška pri startu."));
};

window.onunhandledrejection = (event) => {
  void import("./lib/logger").then(({ logger }) => {
    logger.error("[boot] unhandledrejection", event.reason);
  });
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
(async () => {
  try {
    markBootStep("main:parallel-import-start");

    // Kick off SQLite WASM pre-warm in the background as early as possible.
    // ensureSqliteReady() is idempotent — bootDb() will re-use the already-
    // in-flight or completed initialisation, saving ~150-300 ms of overlap
    // that would otherwise be lost while React renders its first shell frame.
    void import("./lib/persistence/sqlite/readyMachine").then(({ ensureSqliteReady }) => {
      void ensureSqliteReady().catch(() => { /* bootDb handles errors */ });
    });

    const [
      { initColorTheme },
      { default: App },
      { createRoot },
      { eventBus },
      { setDbEventEmitter },
      { taskScheduler },
      { installBodyPointerEventsGuard },
    ] = await Promise.all([
      import("./lib/app-settings"),
      import("./App"),
      import("react-dom/client"),
      import("./lib/event-bus"),
      import("./lib/db-error"),
      import("./lib/scheduler"),
      import("./lib/body-pointer-events-guard"),
    ]);
    markBootStep("main:parallel-import-done");

    // Audit v2 / Wave B.4: register `beforeunload` BEFORE `render()` so any
    // SQLite write React schedules during the first commit cycle is
    // guaranteed to be flushed by `taskScheduler.shutdown()` if the user
    // closes the window immediately. Previously the listener was registered
    // ~one async tick after `render()`, leaving a microtask-sized data-loss
    // window.
    window.addEventListener("beforeunload", () => taskScheduler.shutdown());

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

    // PR-D D5: install the body-pointer-events guard BEFORE the first
    // React render. Previously this lived in an `App.tsx` `useEffect`, so
    // it only attached after the first paint — a Radix Dialog opened in
    // the very first commit (e.g. an onboarding modal) could leak
    // `pointer-events: none` on <body> before the guard was listening.
    // The guard is idempotent and registered via `installed` singleton.
    installBodyPointerEventsGuard();

    markBootStep("main:react-render-start");
    createRoot(document.getElementById("root")!).render(<App />);
    markBootStep("main:react-render-done");

    window.onerror = (_msg, _src, _ln, _col, err) => {
      void import("./lib/logger").then(({ logger: log }) => {
        log.error("[runtime] uncaught error", err || _msg);
      });
    };

    // ── Electron IPC Setup ──
    if (window.electronAPI) {
      import("./lib/electron-integration").then(async ({ setupElectronIPC }) => {
        // PR-D D3: previously `console.warn(...)` — Vite's PROD `esbuild.pure`
        // config tree-shakes `console.warn`, so an IPC wiring failure in a
        // packaged build silently disappeared. Route through the central
        // logger (`error` channel is preserved in PROD) so the failure is
        // visible in DevTools and the crash-log sink.
        const { logger: log } = await import("./lib/logger");
        setupElectronIPC().catch((e) => log.error("[boot] Electron IPC setup failed", e));
        if (typeof window.electronAPI?.onBeforeQuit === "function") {
          window.electronAPI.onBeforeQuit(() => taskScheduler.shutdown());
        }
      });
    }

  } catch (err) {
    void import("./lib/logger").then(({ logger }) => {
      logger.error("[boot] bootstrap failed", err);
    });
    markBootStep("main:bootstrap-error", err instanceof Error ? err.message : String(err));
    showFatalBootError(err instanceof Error ? err.message : String(err));
    return;
  }
})();

} // end web-CTA-guard else block
