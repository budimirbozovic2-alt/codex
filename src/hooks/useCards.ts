import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Card,
  createCard,
  createFlashCard,
  createSection,
  calculateNextReview,
  getDueCards,
  getStats,
  getCategoryStats,
  SRSettings,
  DEFAULT_SR_SETTINGS,
  ErrorLogEntry,
  SourceModule,
} from "@/lib/spaced-repetition";
import { loadAppSettings } from "@/lib/app-settings";
import { ReviewLogEntry, setLastBackupTime } from "@/lib/storage";
import { useCardExport } from "./useCardExport";
import { useCategoryManagement } from "./useCategoryManagement";
import { useCardImport } from "./useCardImport";
import {
  ensureDbOpen,
  migrateFromLocalStorage,
  idbLoadCards,
  idbSaveCards,
  idbPutCard,
  idbDeleteCard,
  idbBulkPutCards,
  idbLoadCategories,
  idbSaveCategories,
  idbLoadSubcategories,
  idbSaveSubcategories,
  idbLoadReviewLog,
  idbLoadRecentReviewLog,
  idbAddReviewLogEntry,
  idbLoadSettings,
  idbSaveSettings,
} from "@/lib/db";

// ─── Internal Map type for O(1) access ──────────────────
type CardMap = Record<string, Card>;

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string, fallback: T): Promise<T> {
  try {
    return await Promise.race([task, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]);
  } catch (error) {
    console.warn(`[boot] ${label} failed`, error);
    return fallback;
  }
}

function arrayToMap(cards: Card[]): CardMap {
  const map: CardMap = {};
  for (const c of cards) map[c.id] = c;
  return map;
}

function mapToArray(map: CardMap): Card[] {
  return Object.values(map);
}

// ─── Surgical persist helpers ───────────────────────────
// Track which cards changed so we can persist only those
type PersistAction =
  | { type: "put"; card: Card }
  | { type: "delete"; id: string }
  | { type: "bulk"; cards: Card[] }
  | { type: "full"; map: CardMap };

// Persist queue — encapsulated to avoid shared mutable state issues
function createPersistQueue() {
  const pending: PersistAction[] = [];
  let timer: number | null = null;

  async function flush() {
    timer = null;
    const actions = pending.splice(0);
    if (actions.length === 0) return;

    try {
      const fullAction = actions.find((a) => a.type === "full");
      if (fullAction && fullAction.type === "full") {
        await idbSaveCards(mapToArray(fullAction.map));
        return;
      }

      const puts: Card[] = [];
      const deletes: string[] = [];
      for (const a of actions) {
        if (a.type === "put") puts.push(a.card);
        else if (a.type === "delete") deletes.push(a.id);
        else if (a.type === "bulk") puts.push(...a.cards);
      }

      if (puts.length > 0) await idbBulkPutCards(puts);
      for (const id of deletes) await idbDeleteCard(id);
    } catch (err: any) {
      if (err?.message === "QUOTA_EXCEEDED") {
        const { toast } = await import("sonner");
        toast.error("Memorija browsera je puna! Exportuj backup i očisti nepotrebne podatke.");
      } else {
        console.error("[persistQueue] flush failed", err);
      }
    }
  }

  function schedule(action: PersistAction) {
    pending.push(action);
    if (timer !== null) return;
    timer = window.setTimeout(flush, 16);
  }

  function cleanup() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.length > 0) {
      flush();
    }
  }

  return { schedule, cleanup };
}

// Singleton persist queue — created once per module, safe for StrictMode double-mount
const persistQueue = createPersistQueue();
const schedulePersist = persistQueue.schedule;

export function useCards() {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [categories, setCategoriesState] = useState<string[]>(["Opšte"]);
  const [subcategories, setSubcategoriesState] = useState<Record<string, string[]>>({});
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);
  const [ready, setReady] = useState(false);
  const initialLoadDone = useRef(false);
  // Cache targetRetention to avoid localStorage parse on every reviewSection call
  const cachedRetentionRef = useRef(loadAppSettings().targetRetention);

  // Flush pending actions on unmount to prevent data loss
  useEffect(() => {
    return () => {
      persistQueue.cleanup();
    };
  }, []);

  // ── Initial async load from IndexedDB ──
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    // OSIGURAČ: Ako se aplikacija ne učita za 12s, forsiraj 'ready' stanje
    const panicTimer = setTimeout(() => {
      setReady((currentReady) => {
        if (!currentReady) {
          console.error("[boot] Panic timeout okidanje! Forsiram ready state.");
          const splash = document.getElementById("app-splash");
          if (splash) splash.remove();
          return true;
        }
        return currentReady;
      });
    }, 12000);

    const splashProgress = (pct: number, label: string) => {
      const bar = document.getElementById("splash-progress");
      const status = document.getElementById("splash-status");
      const percent = document.getElementById("splash-percent");
      if (bar) bar.style.width = `${pct}%`;
      if (status) status.textContent = label;
      if (percent) percent.textContent = `${pct}%`;
    };

    const showSplashError = (msg: string) => {
      const el = document.getElementById("splash-error");
      const msgEl = document.getElementById("splash-error-msg");
      if (el) el.style.display = "block";
      if (msgEl) msgEl.textContent = msg;
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
        await Promise.all([initMetacognitiveCache().catch(() => {}), initPlannerCache().catch(() => {})]);

        splashProgress(25, "Učitavanje kartica…");
        markBootStep("cards:data-load-start");
        const c = await withTimeout(idbLoadCards(), 5000, "cards load", []);

        splashProgress(50, `${c.length} kartica učitano`);
        const cats = await withTimeout(idbLoadCategories(), 2500, "categories load", ["Opšte"]);

        splashProgress(65, "Učitavanje kategorija…");
        const subs = await withTimeout(idbLoadSubcategories(), 2500, "subcategories load", {});

        splashProgress(80, "Učitavanje dnevnika…");
        // Load only last 90 days of review log at boot for performance
        // Full log is still available via idbLoadReviewLog() for export
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
        // 1. Prvo postavljamo ready da React nastavi renderovanje
        setReady(true);
        clearTimeout(panicTimer);

        // 2. Bezbjedno uklanjanje splash screena
        const splash = document.getElementById("app-splash");
        if (splash) {
          splash.style.opacity = "0";
          // Koristimo direktno remove bez previše ugniježdenih timeouta radi sigurnosti
          setTimeout(() => {
            if (splash.parentNode) splash.remove();
          }, 500);
        }

        // 3. Obavještavamo Electron
        if (window.electronAPI?.notifyReady) {
          window.electronAPI.notifyReady();
        }
      }
    })();

    return () => clearTimeout(panicTimer); // Čistimo tajmer ako se komponenta ugasi ranije
  }, []);

  // ── Derived: Card[] for consumers (memoized from map) ──
  const cards = useMemo(() => mapToArray(cardMap), [cardMap]);

  // ── Surgical single-card update (O(1) state + O(1) IDB) ──
  const patchCard = useCallback((id: string, patcher: (card: Card) => Card) => {
    setCardMapState((prev) => {
      const card = prev[id];
      if (!card) return prev;
      const updated = patcher(card);
      schedulePersist({ type: "put", card: updated });
      return { ...prev, [id]: updated };
    });
  }, []);

  // ── Bulk map update (for operations touching many cards) ──
  const setCardMap = useCallback((updater: (prev: CardMap) => CardMap, persist: "surgical" | "full" = "full") => {
    setCardMapState((prev) => {
      const next = updater(prev);
      if (persist === "full") {
        schedulePersist({ type: "full", map: next });
      }
      return next;
    });
  }, []);

  const setCategories = useCallback((updater: (prev: string[]) => string[]) => {
    setCategoriesState((prev) => {
      const next = updater(prev);
      idbSaveCategories(next);
      return next;
    });
  }, []);

  const setSubcategories = useCallback((updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    setSubcategoriesState((prev) => {
      const next = updater(prev);
      idbSaveSubcategories(next);
      return next;
    });
  }, []);

  const setReviewLog = useCallback((updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
    setReviewLogState((prev) => updater(prev));
  }, []);

  // ── Actions ──
  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    idbSaveSettings("srSettings", settings);
  }, []);

  const addCard = useCallback(
    (
      question: string,
      sections: { title: string; content: string }[],
      category: string,
      subcategory?: string,
      chapter?: string,
      extra?: {
        sourceId?: string;
        textAnchor?: string;
        originalSourceSnippet?: string;
        childCardIds?: string[];
        sourceModules?: SourceModule[];
      },
    ) => {
      const card = createCard(question, sections, category, subcategory);
      if (chapter) card.chapter = chapter;
      if (extra?.sourceId) card.sourceId = extra.sourceId;
      if (extra?.textAnchor) card.textAnchor = extra.textAnchor;
      if (extra?.originalSourceSnippet) card.originalSourceSnippet = extra.originalSourceSnippet;
      if (extra?.childCardIds) card.childCardIds = extra.childCardIds;
      if (extra?.sourceModules) card.sourceModules = extra.sourceModules;
      setCardMapState((prev) => {
        schedulePersist({ type: "put", card });
        return { ...prev, [card.id]: card };
      });
      if (!categories.includes(category)) {
        setCategories((prev) => [...prev, category]);
      }
      return card;
    },
    [categories, setCategories],
  );

  const addFlashCard = useCallback(
    (question: string, answer: string, category: string, subcategory?: string) => {
      const card = createFlashCard(question, answer, category, subcategory);
      setCardMapState((prev) => {
        schedulePersist({ type: "put", card });
        return { ...prev, [card.id]: card };
      });
      if (!categories.includes(category)) {
        setCategories((prev) => [...prev, category]);
      }
      return card;
    },
    [categories, setCategories],
  );

  // O(1) direct update — surgical IDB write
  const updateCard = useCallback(
    (
      id: string,
      updates: {
        question?: string;
        sections?: { title: string; content: string }[];
        category?: string;
        subcategory?: string;
        chapter?: string;
        sourceId?: string;
        textAnchor?: string;
        originalSourceSnippet?: string;
        childCardIds?: string[];
        sourceModules?: SourceModule[];
        needsReview?: boolean;
      },
    ) => {
      patchCard(id, (c) => {
        const newCard = { ...c };
        if (updates.question) newCard.question = updates.question;
        if (updates.category) newCard.category = updates.category;
        if (updates.subcategory !== undefined) newCard.subcategory = updates.subcategory;
        if (updates.chapter !== undefined) newCard.chapter = updates.chapter;
        if (updates.sourceId !== undefined) newCard.sourceId = updates.sourceId;
        if (updates.textAnchor !== undefined) newCard.textAnchor = updates.textAnchor;
        if (updates.originalSourceSnippet !== undefined) newCard.originalSourceSnippet = updates.originalSourceSnippet;
        if (updates.childCardIds !== undefined) newCard.childCardIds = updates.childCardIds;
        if (updates.sourceModules !== undefined) newCard.sourceModules = updates.sourceModules;
        if (updates.needsReview !== undefined) newCard.needsReview = updates.needsReview;
        if (updates.sections) {
          newCard.sections = updates.sections.map((s) => {
            const existing = c.sections.find((es) => es.title === s.title);
            if (existing) return { ...existing, content: s.content };
            return createSection(s.title, s.content);
          });
        }
        return newCard;
      });
      toast.success("Kartica ažurirana.");
    },
    [patchCard],
  );

  // O(1) delete — surgical IDB delete
  const deleteCard = useCallback((id: string) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      delete next[id];
      schedulePersist({ type: "delete", id });
      return next;
    });
    toast.success("Kartica obrisana.");
  }, []);

  // O(1) review — surgical IDB write
  const reviewSection = useCallback(
    (cardId: string, sectionId: string, grade: number) => {
      // Use module-level cached retention — refreshed per reviewSection call, not per card
      const cachedRetention = cachedRetentionRef.current;
      patchCard(cardId, (c) => {
        const entry: ReviewLogEntry = { timestamp: Date.now(), cardId, sectionId, grade, category: c.category };
        idbAddReviewLogEntry(entry);
        setReviewLog((log) => [...log, entry]);

        let errorLog = c.errorLog;
        if (errorLog && errorLog.length > 0 && grade >= 3) {
          errorLog = errorLog.map((e) => ({
            ...e,
            recentSuccesses: (e.recentSuccesses || 0) + 1,
            successStreak: (e.successStreak || 0) + 1,
          }));
        } else if (errorLog && errorLog.length > 0 && grade === 1) {
          errorLog = errorLog.map((e) => ({ ...e, successStreak: 0 }));
        }

        return {
          ...c,
          ...(errorLog ? { errorLog } : {}),
          sections: c.sections.map((s) =>
            s.id !== sectionId ? s : { ...s, ...calculateNextReview(s, grade, cachedRetention) },
          ),
        };
      });
    },
    [patchCard, setReviewLog],
  );

  const splitCard = useCallback((id: string) => {
    setCardMapState((prev) => {
      const card = prev[id];
      if (!card || card.sections.length <= 1) return prev;
      const next = { ...prev };
      delete next[id];
      schedulePersist({ type: "delete", id });
      const newCards: Card[] = [];
      card.sections.forEach((section) => {
        const newCard = {
          ...createCard(
            card.question,
            [{ title: section.title, content: section.content }],
            card.category,
            card.subcategory,
          ),
          sections: [{ ...section }],
        };
        next[newCard.id] = newCard;
        newCards.push(newCard);
      });
      schedulePersist({ type: "bulk", cards: newCards });
      return next;
    });
  }, []);

  // O(1) markRead — surgical
  const markRead = useCallback(
    (id: string) => {
      patchCard(id, (c) => ({ ...c, readCount: (c.readCount || 0) + 1 }));
    },
    [patchCard],
  );

  // ── Category management (extracted module) ──
  const {
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    bulkUpdateSubcategory,
  } = useCategoryManagement({
    categories, setCategories, setSubcategories, setCardMap, setCardMapState, schedulePersist,
  });

  // Reorder cards by setting sortOrder based on array position
  const reorderCards = useCallback((orderedIds: string[]) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      const updated: Card[] = [];
      orderedIds.forEach((id, index) => {
        if (next[id]) {
          next[id] = { ...next[id], sortOrder: index };
          updated.push(next[id]);
        }
      });
      schedulePersist({ type: "bulk", cards: updated });
      return next;
    });
  }, []);

  // Update chapter and chapterOrder for cards (used by Mental Skeleton DnD)
  const bulkUpdateChapter = useCallback((updates: { id: string; chapter: string; chapterOrder: number }[]) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      const changed: Card[] = [];
      for (const u of updates) {
        if (next[u.id]) {
          next[u.id] = { ...next[u.id], chapter: u.chapter, chapterOrder: u.chapterOrder };
          changed.push(next[u.id]);
        }
      }
      schedulePersist({ type: "bulk", cards: changed });
      return next;
    });
  }, []);

  // O(1) toggleTag — surgical
  const toggleTag = useCallback(
    (cardId: string, tag: string) => {
      patchCard(cardId, (c) => {
        const tags = c.tags || [];
        return { ...c, tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag] };
      });
    },
    [patchCard],
  );

  // O(1) logError — surgical
  const logError = useCallback(
    (cardId: string, text: string) => {
      patchCard(cardId, (c) => {
        const errorLog = [...(c.errorLog || [])];
        const existing = errorLog.find((e) => e.text === text);
        if (existing) {
          existing.count += 1;
          existing.lastMissed = new Date().toISOString();
          existing.successStreak = 0;
        } else {
          errorLog.push({
            text,
            count: 1,
            recentSuccesses: 0,
            successStreak: 0,
            category: c.category,
            lastMissed: new Date().toISOString(),
          });
        }
        const sections = c.sections.map((s) => ({
          ...s,
          difficulty: Math.min(10, s.difficulty + 0.5),
          stability: Math.max(0.1, s.stability * 0.85),
        }));
        return { ...c, errorLog, sections };
      });
    },
    [patchCard],
  );

  // O(1) clearErrorLog — surgical
  const clearErrorLog = useCallback(
    (cardId: string) => {
      patchCard(cardId, (c) => ({ ...c, errorLog: [] }));
    },
    [patchCard],
  );

  // O(1) toggleKeyPart — surgical: add if missing, remove if present
  const addKeyPart = useCallback(
    (cardId: string, text: string) => {
      patchCard(cardId, (c) => {
        const parts = c.keyParts || [];
        const normalized = text.trim();
        const existing = parts.findIndex((p) => p === normalized);
        if (existing >= 0) {
          // Toggle off — remove this key part
          return { ...c, keyParts: parts.filter((_, i) => i !== existing) };
        }
        return { ...c, keyParts: [...parts, normalized] };
      });
    },
    [patchCard],
  );

  // Bulk flag cards as needsReview (for source version updates)
  const bulkFlagNeedsReview = useCallback((cardIds: string[]) => {
    if (cardIds.length === 0) return;
    setCardMapState((prev) => {
      const next = { ...prev };
      const updated: Card[] = [];
      for (const id of cardIds) {
        if (next[id]) {
          next[id] = { ...next[id], needsReview: true };
          updated.push(next[id]);
        }
      }
      schedulePersist({ type: "bulk", cards: updated });
      return next;
    });
  }, []);

  // ── Export/Import (extracted to separate modules) ──
  const { exportData, exportTemplate } = useCardExport({ cards, categories, subcategories, reviewLog, srSettings });
  const { importData, importCards } = useCardImport({
    categories, setCardMap, setCategories, setSubcategories,
    setReviewLog: setReviewLogState, updateSRSettings,
    schedulePersist, setCardMapState,
  });

  // ── Derived data ──
  const cardCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach((cat) => {
      counts[cat] = 0;
    });
    cards.forEach((c) => {
      counts[c.category] = (counts[c.category] || 0) + 1;
    });
    return counts;
  }, [cards, categories]);

  const dueCards = useMemo(() => getDueCards(cards), [cards]);
  const stats = useMemo(() => getStats(cards), [cards]);
  const categoryStats = useMemo(
    () => Object.fromEntries(categories.map((cat) => [cat, getCategoryStats(cards, cat)])),
    [cards, categories],
  );

  const reorderCategories = useCallback((ordered: string[]) => {
    setCategoriesState(ordered);
    idbSaveCategories(ordered);
  }, []);

  const reorderSubcategories = useCallback((category: string, ordered: string[]) => {
    setSubcategoriesState((prev) => {
      const next = { ...prev, [category]: ordered };
      idbSaveSubcategories(next);
      return next;
    });
  }, []);

  return {
    cards,
    categories,
    subcategories,
    dueCards,
    stats,
    categoryStats,
    cardCountByCategory,
    reviewLog,
    srSettings,
    ready,
    addCard,
    addFlashCard,
    updateCard,
    deleteCard,
    splitCard,
    reviewSection,
    markRead,
    toggleTag,
    addKeyPart,
    bulkFlagNeedsReview,
    bulkUpdateSubcategory,
    bulkUpdateChapter,
    reorderCards,
    logError,
    clearErrorLog,
    exportData,
    exportTemplate,
    importData,
    importCards,
    addCategory,
    renameCategory,
    deleteCategory,
    addSubcategory,
    renameSubcategory,
    deleteSubcategory,
    reorderCategories,
    reorderSubcategories,
    updateSRSettings,
  };
}
