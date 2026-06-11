import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler";
/**
 * Splash screen DOM helpers — purely presentational.
 * All `document.getElementById("splash-*")` access lives here.
 */
export function splashProgress(pct: number, label: string) {
  try {
    const bar = document.getElementById("splash-progress");
    const status = document.getElementById("splash-status");
    const percent = document.getElementById("splash-percent");
    if (bar) bar.style.width = `${pct}%`;
    if (status) status.textContent = label;
    if (percent) percent.textContent = `${pct}%`;
  } catch (e) { logger.warn("[boot] splashProgress DOM error", e); }
}

export function showSplashError(msg: string) {
  try {
    const el = document.getElementById("splash-error");
    const msgEl = document.getElementById("splash-error-msg");
    if (el) el.style.display = "block";
    if (msgEl) msgEl.textContent = msg;
  } catch (e) { logger.warn("[boot] showSplashError DOM error", e); }
}

export function cleanupSplash() {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/bbcc467f-b810-4cc1-aebf-add63a6395ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f62800'},body:JSON.stringify({sessionId:'f62800',location:'splash.ts:cleanupSplash',message:'cleanupSplash called',data:{hasSplash:!!document.getElementById('app-splash'),hasFallback:!!document.getElementById('boot-fallback'),fallbackVisible:document.getElementById('boot-fallback')?.style?.display},hypothesisId:'B',runId:'run1',timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const splash = document.getElementById("app-splash");
    if (splash) {
      splash.style.opacity = "0";
      taskScheduler.setTimeout(() => {
        try { if (splash.parentNode) splash.remove(); } catch (e) { logger.warn("[boot] splash remove failed", e); }
      }, 500, { label: "boot:splash-remove", priority: "high" });
    }
  } catch (e) { logger.warn("[boot] splash cleanup failed", e); }
}

export function forceRemoveSplash() {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/bbcc467f-b810-4cc1-aebf-add63a6395ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f62800'},body:JSON.stringify({sessionId:'f62800',location:'splash.ts:forceRemoveSplash',message:'forceRemoveSplash called',data:{hasFallback:!!document.getElementById('boot-fallback')},hypothesisId:'B',runId:'run1',timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const splash = document.getElementById("app-splash");
    if (splash) splash.remove();
  } catch (e) { logger.warn("[boot] splash cleanup failed", e); }
}

export function notifyElectronReady() {
  try {
    if (window.electronAPI?.notifyReady) {
      window.electronAPI.notifyReady();
    }
  } catch (e) { logger.warn("[boot] notifyReady failed", e); }
}
