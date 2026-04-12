import { useEffect, useRef, useState } from "react";
import { Card, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, arrayToMap, bumpMapVersion } from "@/lib/persist-queue";
import {
  ensureDbOpen,
  migrateFromLocalStorage,
  idbLoadCards,
  idbLoadRecentReviewLog,
  idbLoadSettings,
  getDbErrorState,
  seedDefaultCategories,
  db,
  type CategoryRecord,
  type SubcategoryNode,
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
  setCategoryRecordsState: React.Dispatch<React.SetStateAction<CategoryRecord[]>>;
  setReviewLogState: React.Dispatch<React.SetStateAction<ReviewLogEntry[]>>;
  setSrSettingsState: React.Dispatch<React.SetStateAction<SRSettings>>;
}

export function useCardBootstrap(setters: BootSetters) {
  const { setCardMapState, setCategoryRecordsState, setReviewLogState, setSrSettingsState } = setters;
  const [ready, setReady] = useState(false);
  const [dbError, setDbError] = useState<{ type: "version" | "timeout"; message: string } | null>(null);
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
        if (import.meta.env.DEV) console.log("[boot:diag] step 1: ensureDbOpen");
        const dbOk = await ensureDbOpen(6000);
        markBootStep("cards:db-open-done", dbOk ? "ok" : "failed");
        if (!dbOk) {
          const errState = getDbErrorState();
          if (errState) {
            setDbError(errState);
            splashProgress(100, "Greška baze podataka");
          } else {
            splashProgress(100, "Pokretanje bez baze…");
            showSplashError("IndexedDB nije dostupan ili je isteklo vrijeme čekanja.");
          }
          return;
        }

        markBootStep("cards:migration-start");
        splashProgress(10, "Migracija podataka…");
        if (import.meta.env.DEV) console.log("[boot:diag] step 2: migrateFromLocalStorage");
        await withTimeout(migrateFromLocalStorage(), 3000, "migration", undefined);
        
        // Mnemonics migration (localStorage -> IDB)
        const { migrateMnemonicsFromLocalStorageToIDB } = await import("@/lib/mnemonic-storage");
        await withTimeout(migrateMnemonicsFromLocalStorageToIDB(), 3000, "mnemonic migration", undefined);

        markBootStep("cards:migration-done");

        // Check for interrupted writes from previous session
        checkInterruptedFlush();

        // Initialize in-memory caches from IDB (replaces localStorage)
        splashProgress(15, "Inicijalizacija keša…");
        if (import.meta.env.DEV) console.log("[boot:diag] step 3: initCaches");
        const { initMetacognitiveCache } = await import("@/lib/metacognitive-storage");
        const { initPlannerCache } = await import("@/lib/planner-storage");
        await withTimeout(
          Promise.all([initMetacognitiveCache().catch((e) => console.warn("[silent]", e)), initPlannerCache().catch((e) => console.warn("[silent]", e))]),
          3000, "cache init", undefined
        );

        splashProgress(25, "Učitavanje kartica…");
        if (import.meta.env.DEV) console.log("[boot:diag] step 4: loading data");
        markBootStep("cards:data-load-start");
        const c = await withTimeout(idbLoadCards(), 5000, "cards load", []);

        splashProgress(50, `${c.length} kartica učitano`);
        // Load CategoryRecord[] from IDB, seed defaults if empty
        const catRecords = await withTimeout(seedDefaultCategories(), 2500, "categories load", []);
        if (import.meta.env.DEV) console.log("[boot:diag] categories loaded:", catRecords.length, catRecords.map((r: CategoryRecord) => r.name));

        // Build card-by-category index O(n) instead of O(n×categories)
        const cardsByCat = new Map<string, typeof c>();
        for (const card of c) {
          const arr = cardsByCat.get(card.categoryId) || [];
          arr.push(card);
          cardsByCat.set(card.categoryId, arr);
        }

        // Build subcategories map + fallback "Opšte" nodes for orphaned cards
        const updatedRecords: CategoryRecord[] = [];
        let needsPersist = false;

        for (const r of catRecords) {
          // Migrate legacy string[] to SubcategoryNode[] with UUID
          let nodes: SubcategoryNode[] = (r.subcategories || []).map((s: any, i: number) => {
            if (typeof s === "string") {
              needsPersist = true;
              return { id: crypto.randomUUID(), name: s, chapters: [] as import("@/lib/db").ChapterNode[], sortOrder: i };
            }
            // Ensure node has id
            const node: SubcategoryNode = {
              id: s.id || crypto.randomUUID(),
              name: s.name,
              sortOrder: s.sortOrder ?? i,
              chapters: ((s.chapters || []) as any[]).map((ch: any, ci: number): import("@/lib/db").ChapterNode => {
                if (typeof ch === "string") {
                  needsPersist = true;
                  return { id: crypto.randomUUID(), name: ch, sortOrder: ci };
                }
                if (!ch.id) {
                  needsPersist = true;
                  return { ...ch, id: crypto.randomUUID(), sortOrder: ch.sortOrder ?? ci };
                }
                return ch;
              }),
            };
            if (!s.id) needsPersist = true;
            return node;
          });

          // Scan cards belonging to this category for orphaned subcategories/chapters
          const catCards = cardsByCat.get(r.id) || [];
          for (const card of catCards) {
            const sub = card.subcategoryId || "";
            const ch = card.chapterId || "";
            if (!sub) continue;

            let node = nodes.find((n) => n.id === sub);
            if (!node) {
              node = { id: crypto.randomUUID(), name: sub, chapters: [], sortOrder: nodes.length };
              nodes.push(node);
              needsPersist = true;
              if (import.meta.env.DEV) console.log(`[boot] fallback SubcategoryNode created: "${sub}" in category ${r.name}`);
            }
            if (ch && !node.chapters.some(c => c.id === ch)) {
              node.chapters.push({ id: crypto.randomUUID(), name: ch, sortOrder: node.chapters.length });
              needsPersist = true;
              if (import.meta.env.DEV) console.log(`[boot] fallback chapter registered: "${ch}" under "${sub}" in ${r.name}`);
            }
          }

          // One-time cleanup: remove phantom nodes with UUID-shaped names and zero cards
          const uuidPattern = /^[0-9a-f]{8}-/;
          const cardSubIds = new Set(catCards.map(card => card.subcategoryId).filter(Boolean));
          const prevLen = nodes.length;
          nodes = nodes.filter(n => {
            if (!uuidPattern.test(n.name)) return true;
            if (cardSubIds.has(n.id)) return true;
            if (import.meta.env.DEV) console.log(`[boot] removing phantom subcategory: "${n.name}" from ${r.name}`);
            needsPersist = true;
            return false;
          });
          // Clean phantom chapters within remaining nodes
          for (const n of nodes) {
            const cardChapIds = new Set(catCards.filter(card => card.subcategoryId === n.id).map(card => card.chapterId).filter(Boolean));
            n.chapters = n.chapters.filter(ch => {
              if (!uuidPattern.test(ch.name)) return true;
              if (cardChapIds.has(ch.id)) return true;
              if (import.meta.env.DEV) console.log(`[boot] removing phantom chapter: "${ch.name}" from ${n.name}`);
              needsPersist = true;
              return false;
            });
          }

          updatedRecords.push({ ...r, subcategories: nodes });
        }

        // Persist migrated/fallback nodes back to IDB (fire-and-forget)
        if (needsPersist && db) {
          Promise.all(
            updatedRecords.map((rec) =>
              db!.categories.update(rec.id, { subcategories: rec.subcategories }).catch((e: unknown) =>
                console.warn("[boot] fallback persist failed for", rec.name, e)
              )
            )
          ).catch(() => {});
        }

        // Always use updatedRecords (with migrated nodes) as canonical state
        const finalRecords = needsPersist ? updatedRecords : catRecords;

        splashProgress(65, "Učitavanje kategorija…");

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

        if (import.meta.env.DEV) console.log("[boot:diag] setting state — cards:", c.length, "categories:", finalRecords.length);
        setCardMapState(arrayToMap(c));
        bumpMapVersion();
        setCategoryRecordsState(finalRecords);
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

  return { ready, dbError };
}
