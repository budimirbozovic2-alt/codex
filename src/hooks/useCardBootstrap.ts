import { useEffect, useRef, useState } from "react";
import { Card, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, arrayToMap } from "@/lib/persist-queue";
import {
  ensureDbOpen,
  migrateFromLocalStorage,
  idbLoadCards,
  idbLoadCategories,
  idbLoadSubcategories,
  idbLoadRecentReviewLog,
  idbLoadSettings,
  getDbErrorState,
} from "@/lib/db";
import { checkInterruptedFlush } from "@/lib/persist-queue";

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string, fallback: T): Promise<T> {
  try {
    return await Promise.race([task, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]);
  } catch (error) {
    console.warn(`[boot] ${label} failed`, error);
    return fallback;
  }
}

interface BootSetters {
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  setCategoriesState: React.Dispatch<React.SetStateAction<string[]>>;
  setSubcategoriesState: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setReviewLogState: React.Dispatch<React.SetStateAction<ReviewLogEntry[]>>;
  setSrSettingsState: React.Dispatch<React.SetStateAction<SRSettings>>;
}

export function useCardBootstrap(setters: BootSetters) {
  const { setCardMapState, setCategoriesState, setSubcategoriesState, setReviewLogState, setSrSettingsState } = setters;
  const [ready, setReady] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    // OSIGURAČ: Ako se aplikacija ne učita za 8s, forsiraj 'ready' stanje
    const panicTimer = setTimeout(() => {
      setReady((currentReady) => {
        if (!currentReady) {
          console.error("[boot] Panic timeout (8s)! Forsiram ready state.");
          try {
            const splash = document.getElementById("app-splash");
            if (splash) splash.remove();
          } catch (e) { console.warn("[boot] splash cleanup failed", e); }
          return true;
        }
        return currentReady;
      });
    }, 8000);

    const splashProgress = (pct: number, label: string) => {
      try {
        const bar = document.getElementById("splash-progress");
        const status = document.getElementById("splash-status");
        const percent = document.getElementById("splash-percent");
        if (bar) bar.style.width = `${pct}%`;
        if (status) status.textContent = label;
        if (percent) percent.textContent = `${pct}%`;
      } catch (e) { console.warn("[boot] splashProgress DOM error", e); }
    };

    const showSplashError = (msg: string) => {
      try {
        const el = document.getElementById("splash-error");
        const msgEl = document.getElementById("splash-error-msg");
        if (el) el.style.display = "block";
        if (msgEl) msgEl.textContent = msg;
      } catch (e) { console.warn("[boot] showSplashError DOM error", e); }
    };

    (async () => {
      const { markBootStep } = await import("@/lib/boot-trace");
      try {
        markBootStep("cards:init-start");
        splashProgress(5, "Otvaranje baze…");
        markBootStep("cards:db-open-start");
        const dbOk = await ensureDbOpen(6000);
        markBootStep("cards:db-open-done", dbOk ? "ok" : "failed");
        if (!dbOk) {
          console.warn("[boot] DB unavailable — starting in fallback mode");
          splashProgress(100, "Pokretanje bez baze…");
          showSplashError("IndexedDB nije dostupan ili je isteklo vrijeme čekanja.");
          return;
        }

        markBootStep("cards:migration-start");
        splashProgress(10, "Migracija podataka…");
        await migrateFromLocalStorage();
        markBootStep("cards:migration-done");

        // Initialize in-memory caches from IDB (replaces localStorage)
        splashProgress(15, "Inicijalizacija keša…");
        const { initMetacognitiveCache } = await import("@/lib/metacognitive-storage");
        const { initPlannerCache } = await import("@/lib/planner-storage");
        await Promise.all([initMetacognitiveCache().catch((e) => console.warn("[silent]", e)), initPlannerCache().catch((e) => console.warn("[silent]", e))]);

        splashProgress(25, "Učitavanje kartica…");
        markBootStep("cards:data-load-start");
        const c = await withTimeout(idbLoadCards(), 5000, "cards load", []);

        splashProgress(50, `${c.length} kartica učitano`);
        const cats = await withTimeout(idbLoadCategories(), 2500, "categories load", ["Opšte"]);

        splashProgress(65, "Učitavanje kategorija…");
        const subs = await withTimeout(idbLoadSubcategories(), 2500, "subcategories load", {});

        splashProgress(80, "Učitavanje dnevnika…");
        const log = await withTimeout(idbLoadRecentReviewLog(90), 2500, "review log load", []);

        splashProgress(90, "Učitavanje podešavanja…");
        const settings = await withTimeout(
          idbLoadSettings<SRSettings>("srSettings", DEFAULT_SR_SETTINGS),
          2500,
          "settings load",
          DEFAULT_SR_SETTINGS,
        );
        markBootStep("cards:data-load-done", `${c.length} cards`);

        setCardMapState(arrayToMap(c));
        setCategoriesState(cats);
        setSubcategoriesState(subs);
        setReviewLogState(log);
        setSrSettingsState(settings);

        splashProgress(100, "Spremno!");
        markBootStep("cards:ready");
      } catch (error) {
        console.error("[boot] useCards init:failed", error);
        markBootStep("cards:init-error", error instanceof Error ? error.message : String(error));
        splashProgress(100, "Pokretanje sa rezervnim stanjem…");
        showSplashError(error instanceof Error ? error.message : "Neočekivana greška pri učitavanju podataka.");
      } finally {
      setReady(true);
        clearTimeout(panicTimer);

        try {
          const splash = document.getElementById("app-splash");
          if (splash) {
            splash.style.opacity = "0";
            setTimeout(() => {
              try { if (splash.parentNode) splash.remove(); } catch (e) { console.warn("[boot] splash remove failed", e); }
            }, 500);
          }
        } catch (e) { console.warn("[boot] splash cleanup failed", e); }

        try {
          if (window.electronAPI?.notifyReady) {
            window.electronAPI.notifyReady();
          }
        } catch (e) { console.warn("[boot] notifyReady failed", e); }
      }
    })();

    return () => clearTimeout(panicTimer);
  }, []);

  return { ready };
}
