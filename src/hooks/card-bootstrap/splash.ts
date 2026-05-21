import { logger } from "@/lib/logger";
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
  try {
    const splash = document.getElementById("app-splash");
    if (splash) {
      splash.style.opacity = "0";
      setTimeout(() => {
        try { if (splash.parentNode) splash.remove(); } catch (e) { logger.warn("[boot] splash remove failed", e); }
      }, 500);
    }
  } catch (e) { logger.warn("[boot] splash cleanup failed", e); }
}

export function forceRemoveSplash() {
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
