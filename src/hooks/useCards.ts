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

  const addCategory = useCallback(
    (name: string) => {
      if (!categories.includes(name)) setCategories((prev) => [...prev, name]);
    },
    [categories, setCategories],
  );

  const renameCategory = useCallback(
    (oldName: string, newName: string) => {
      if (categories.includes(newName)) return;
      setCategories((prev) => prev.map((c) => (c === oldName ? newName : c)));
      setCardMap((prev) => {
        const next: CardMap = {};
        for (const [id, c] of Object.entries(prev)) {
          next[id] = c.category === oldName ? { ...c, category: newName } : c;
        }
        return next;
      }, "full");
      setSubcategories((prev) => {
        const next = { ...prev };
        if (next[oldName]) {
          next[newName] = next[oldName];
          delete next[oldName];
        }
        return next;
      });
    },
    [categories, setCategories, setCardMap, setSubcategories],
  );

  const deleteCategory = useCallback(
    (name: string) => {
      setCategories((prev) => prev.filter((c) => c !== name));
      setCardMap((prev) => {
        const next: CardMap = {};
        for (const [id, c] of Object.entries(prev)) {
          next[id] = c.category === name ? { ...c, category: "Opšte", subcategory: "" } : c;
        }
        return next;
      }, "full");
      setSubcategories((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    },
    [setCategories, setCardMap, setSubcategories],
  );

  const addSubcategory = useCallback(
    (category: string, subcategory: string) => {
      setSubcategories((prev) => {
        const list = prev[category] || [];
        if (list.includes(subcategory)) return prev;
        return { ...prev, [category]: [...list, subcategory] };
      });
    },
    [setSubcategories],
  );

  const renameSubcategory = useCallback(
    (category: string, oldName: string, newName: string) => {
      setSubcategories((prev) => {
        const list = prev[category] || [];
        if (list.includes(newName)) return prev;
        return { ...prev, [category]: list.map((s) => (s === oldName ? newName : s)) };
      });
      setCardMap((prev) => {
        const next: CardMap = {};
        for (const [id, c] of Object.entries(prev)) {
          next[id] = c.category === category && c.subcategory === oldName ? { ...c, subcategory: newName } : c;
        }
        return next;
      }, "full");
    },
    [setSubcategories, setCardMap],
  );

  const deleteSubcategory = useCallback(
    (category: string, subcategory: string) => {
      setSubcategories((prev) => ({ ...prev, [category]: (prev[category] || []).filter((s) => s !== subcategory) }));
      setCardMap((prev) => {
        const next: CardMap = {};
        for (const [id, c] of Object.entries(prev)) {
          next[id] = c.category === category && c.subcategory === subcategory ? { ...c, subcategory: "" } : c;
        }
        return next;
      }, "full");
    },
    [setSubcategories, setCardMap],
  );

  // O(1) markRead — surgical
  const markRead = useCallback(
    (id: string) => {
      patchCard(id, (c) => ({ ...c, readCount: (c.readCount || 0) + 1 }));
    },
    [patchCard],
  );

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategory: string) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      const updated: Card[] = [];
      for (const id of ids) {
        if (next[id]) {
          next[id] = { ...next[id], subcategory };
          updated.push(next[id]);
        }
      }
      schedulePersist({ type: "bulk", cards: updated });
      return next;
    });
  }, []);

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

  const downloadFile = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Chunked JSON builder using Blob parts to avoid memory spikes on large datasets
  const buildJsonChunked = useCallback(
    async (data: object, onProgress: (p: number, msg: string) => void): Promise<Blob> => {
      onProgress(10, "Priprema podataka...");
      await new Promise((r) => setTimeout(r, 30));

      const dataAny = data as any;
      const cardsArr: any[] = dataAny.cards || [];
      const CHUNK = 500;
      const blobParts: (string | Blob)[] = [];

      // Build header (everything except cards)
      const rest = { ...dataAny };
      delete rest.cards;
      const restJson = JSON.stringify(rest);
      // Open: {"key":"val",...,"cards":[
      blobParts.push(restJson.slice(0, -1) + ',"cards":[');

      // Serialize cards in chunks → Blob parts (avoids giant string concatenation)
      for (let i = 0; i < cardsArr.length; i += CHUNK) {
        const chunk = cardsArr.slice(i, i + CHUNK);
        const prefix = i > 0 ? "," : "";
        blobParts.push(prefix + chunk.map((c: any) => JSON.stringify(c)).join(","));
        const pct = 10 + Math.round((i / Math.max(cardsArr.length, 1)) * 60);
        onProgress(pct, `Serijalizacija kartica... ${Math.min(i + CHUNK, cardsArr.length)}/${cardsArr.length}`);
        await new Promise((r) => setTimeout(r, 10)); // yield to UI
      }

      blobParts.push("]}");
      onProgress(75, "Finalizacija...");
      await new Promise((r) => setTimeout(r, 20));

      return new Blob(blobParts, { type: "application/json" });
    },
    [],
  );

  const exportTemplate = useCallback(
    async (compress: boolean, onProgress: (p: number, msg: string) => void) => {
      const templateCards = cards.map((c) => ({
        id: c.id,
        question: c.question,
        sections: c.sections.map((s) => ({ title: s.title, content: s.content })),
        category: c.category,
        subcategory: c.subcategory || "",
        chapter: c.chapter || "",
        type: c.type,
        tags: c.tags || [],
      }));
      const data = { version: 2, type: "template", cards: templateCards, categories, subcategories };
      const dateStr = new Date().toISOString().slice(0, 10);

      const blob = await buildJsonChunked(data, onProgress);

      if (compress) {
        onProgress(85, "Kompresija...");
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        zip.file(`codex-template-${dateStr}.json`, blob);
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        onProgress(100, "Preuzimanje...");
        downloadFile(zipBlob, `codex-template-${dateStr}.zip`);
        toast.success("Template uspješno exportovan.");
      } else {
        onProgress(100, "Preuzimanje...");
        downloadFile(blob, `codex-template-${dateStr}.json`);
        toast.success("Template uspješno exportovan.");
      }
    },
    [cards, categories, subcategories, downloadFile, buildJsonChunked],
  );

  const exportData = useCallback(
    async (compress: boolean, onProgress: (p: number, msg: string) => void) => {
      onProgress(5, "Učitavanje svih podataka...");
      const { db, idbLoadReviewLog: loadFullReviewLog } = await import("@/lib/db");
      const [
        sources,
        mindMaps,
        diary,
        calibrationLog,
        latencyLog,
        slippageLog,
        activityLog,
        disciplineLog,
        pomodoroLog,
        fullReviewLog,
      ] = await Promise.all([
        db.sources.toArray(),
        db.mindMaps.toArray(),
        db.diary.toArray(),
        db.calibrationLog.toArray(),
        db.latencyLog.toArray(),
        db.slippageLog.toArray(),
        db.activityLog.toArray(),
        db.disciplineLog.toArray(),
        db.pomodoroLog.toArray(),
        loadFullReviewLog(), // Full log for export, not the truncated in-memory version
      ]);

      // Collect key localStorage items + IDB settings for planner
      const localStorageData: Record<string, any> = {};
      const lsKeys = [
        "sr-app-settings",
        "sr-mnemonic-workshop",
        "sr-mnemonic-associations",
        "sr-major-system-map",
        "sr-learn-progress",
        "sr-last-backup",
      ];
      for (const key of lsKeys) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          try {
            localStorageData[key] = JSON.parse(val);
          } catch {
            localStorageData[key] = val;
          }
        }
      }
      // Read planner data from IDB (migrated from localStorage)
      const [plannerConfig, dailyMapped, dailyMappedDate] = await Promise.all([
        db.settings.get("plannerConfig"),
        db.settings.get("dailyMapped"),
        db.settings.get("dailyMappedDate"),
      ]);
      if (plannerConfig?.value) localStorageData["sr-planner-config"] = plannerConfig.value;
      if (dailyMapped?.value != null) localStorageData["sr-daily-mapped-count"] = dailyMapped.value;
      if (dailyMappedDate?.value) localStorageData["sr-daily-mapped-date"] = dailyMappedDate.value;

      const data = {
        version: 4,
        type: "full",
        cards,
        categories,
        subcategories,
        reviewLog: fullReviewLog,
        srSettings,
        sources,
        mindMaps,
        diary,
        calibrationLog,
        latencyLog,
        slippageLog,
        activityLog,
        disciplineLog,
        pomodoroLog,
        localStorageData,
      };
      const dateStr = new Date().toISOString().slice(0, 10);

      const blob = await buildJsonChunked(data, onProgress);

      if (compress) {
        onProgress(85, "Kompresija...");
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        zip.file(`codex-backup-${dateStr}.json`, blob);
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        onProgress(100, "Preuzimanje...");
        downloadFile(zipBlob, `codex-backup-${dateStr}.zip`);
        toast.success("Kompletni backup uspješno exportovan.");
      } else {
        onProgress(100, "Preuzimanje...");
        downloadFile(blob, `codex-backup-${dateStr}.json`);
        toast.success("Kompletni backup uspješno exportovan.");
      }
      setLastBackupTime();
    },
    [cards, categories, subcategories, reviewLog, srSettings, downloadFile, buildJsonChunked],
  );

  const importData = useCallback(
    async (file: File, strategy: "keep" | "overwrite" | "skip" | "newer" = "skip") => {
      try {
        let jsonText: string;
        if (file.name.endsWith(".zip")) {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(file);
          const jsonFile = Object.keys(zip.files).find((n) => n.endsWith(".json"));
          if (!jsonFile) {
            toast.error("ZIP ne sadrži JSON fajl.");
            return;
          }
          jsonText = await zip.files[jsonFile].async("string");
        } else {
          jsonText = await file.text();
        }

        let parsed: any;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          toast.error("Neispravan JSON format. Fajl je oštećen ili nije validan.");
          return;
        }

        // Schema validation
        if (!parsed || typeof parsed !== "object") {
          toast.error("Fajl ne sadrži validan JSON objekat.");
          return;
        }
        if (!Array.isArray(parsed.cards)) {
          toast.error("Fajl ne sadrži 'cards' niz. Provjerite format.");
          return;
        }
        // Validate sample cards
        for (let i = 0; i < Math.min(5, parsed.cards.length); i++) {
          const c = parsed.cards[i];
          if (!c || typeof c.question !== "string" || !Array.isArray(c.sections)) {
            toast.error(`Kartica #${i + 1} ima neispravan format (nedostaje question ili sections).`);
            return;
          }
        }

        const { sanitizeHtml } = await import("@/lib/sanitize");
        const migrateImported = (c: any): Card => ({
          ...c,
          readCount: c.readCount || 0,
          type: c.type || "essay",
          subcategory: c.subcategory || "",
          question: sanitizeHtml(c.question ?? ""),
          tags: c.tags || [],
          errorLog: c.errorLog || [],
          sections: (c.sections || []).map((s: any) => ({
            ...s,
            id: s.id || crypto.randomUUID(),
            state: s.state ?? 0,
            lapses: s.lapses || 0,
            content: sanitizeHtml(s.content ?? ""),
            stability: s.stability ?? 0,
            difficulty: s.difficulty ?? 5,
            interval: s.interval ?? 0,
            nextReview: s.nextReview ?? 0,
            lastReviewed: s.lastReviewed ?? null,
            elapsedDays: s.elapsedDays ?? 0,
            scheduledDays: s.scheduledDays ?? 0,
          })),
        });

        const importedCards: Card[] = parsed.cards.map(migrateImported);
        setCardMap((prev) => {
          const next = { ...prev };
          if (strategy === "newer") {
            const getLastReview = (c: Card) => Math.max(0, ...c.sections.map((s) => s.lastReviewed || 0));
            importedCards.forEach((ic) => {
              const existing = next[ic.id];
              if (!existing) {
                next[ic.id] = ic;
              } else if (getLastReview(ic) > getLastReview(existing)) {
                next[ic.id] = ic;
              }
            });
          } else if (strategy === "overwrite") {
            importedCards.forEach((ic) => {
              next[ic.id] = ic;
            });
          } else {
            importedCards.forEach((ic) => {
              if (!next[ic.id]) next[ic.id] = ic;
            });
          }
          return next;
        }, "full");

        if (Array.isArray(parsed.categories)) {
          setCategories((prev) => [...new Set([...prev, ...parsed.categories])]);
        }
        if (parsed.subcategories && typeof parsed.subcategories === "object") {
          setSubcategories((prev) => {
            const merged = { ...prev };
            for (const [cat, subs] of Object.entries(parsed.subcategories as Record<string, string[]>)) {
              merged[cat] = [...new Set([...(merged[cat] || []), ...subs])];
            }
            return merged;
          });
        }
        if (Array.isArray(parsed.reviewLog) && strategy === "overwrite") {
          setReviewLogState(parsed.reviewLog);
        }
        if (parsed.srSettings && strategy === "overwrite") {
          updateSRSettings({ ...DEFAULT_SR_SETTINGS, ...parsed.srSettings });
        }

        // Restore sources & mindMaps (v3+) — surgical upsert (no clear())
        if (Array.isArray(parsed.sources) || Array.isArray(parsed.mindMaps)) {
          const { db } = await import("@/lib/db");
          if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
            const sanitizedSources = parsed.sources.map((src: any) => ({
              ...src,
              htmlContent: sanitizeHtml(src.htmlContent ?? ""),
            }));
            await db.sources.bulkPut(sanitizedSources);
            if (strategy === "overwrite") {
              const importedIds = new Set(sanitizedSources.map((s: any) => s.id));
              const allKeys = await db.sources.toCollection().primaryKeys();
              const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
              if (toDelete.length > 0) await db.sources.bulkDelete(toDelete);
            }
          }
          if (Array.isArray(parsed.mindMaps) && parsed.mindMaps.length > 0) {
            await db.mindMaps.bulkPut(parsed.mindMaps);
            if (strategy === "overwrite") {
              const importedIds = new Set(parsed.mindMaps.map((m: any) => m.id));
              const allKeys = await db.mindMaps.toCollection().primaryKeys();
              const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
              if (toDelete.length > 0) await db.mindMaps.bulkDelete(toDelete);
            }
          }
        }

        // Restore metacognitive + planner IDB tables (v4+) — surgical upsert
        const idbTables: { key: string; table: string }[] = [
          { key: "diary", table: "diary" },
          { key: "calibrationLog", table: "calibrationLog" },
          { key: "latencyLog", table: "latencyLog" },
          { key: "slippageLog", table: "slippageLog" },
          { key: "activityLog", table: "activityLog" },
          { key: "disciplineLog", table: "disciplineLog" },
          { key: "pomodoroLog", table: "pomodoroLog" },
        ];
        const hasExtraTables = idbTables.some((t) => Array.isArray(parsed[t.key]) && parsed[t.key].length > 0);
        if (hasExtraTables) {
          const { db } = await import("@/lib/db");
          for (const { key, table } of idbTables) {
            if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
              await (db as any)[table].bulkPut(parsed[key]);
              if (strategy === "overwrite") {
                const importedIds = new Set(parsed[key].map((r: any) => r.id));
                const allKeys = await (db as any)[table].toCollection().primaryKeys();
                const toDelete = allKeys.filter((k: any) => !importedIds.has(k));
                if (toDelete.length > 0) await (db as any)[table].bulkDelete(toDelete);
              }
            }
          }
        }

        // Restore localStorage data (v4+)
        if (parsed.localStorageData && typeof parsed.localStorageData === "object") {
          for (const [key, value] of Object.entries(parsed.localStorageData)) {
            localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
          }
        }

        const extraParts: string[] = [];
        if (Array.isArray(parsed.sources) && parsed.sources.length > 0)
          extraParts.push(`${parsed.sources.length} izvora`);
        if (Array.isArray(parsed.mindMaps) && parsed.mindMaps.length > 0)
          extraParts.push(`${parsed.mindMaps.length} mentalnih mapa`);
        if (Array.isArray(parsed.diary) && parsed.diary.length > 0)
          extraParts.push(`${parsed.diary.length} dnevničkih zapisa`);
        if (Array.isArray(parsed.disciplineLog) && parsed.disciplineLog.length > 0) extraParts.push("disciplinski log");
        if (parsed.localStorageData) extraParts.push("podešavanja i planer");
        const extraMsg = extraParts.length > 0 ? ` + ${extraParts.join(", ")}` : "";
        toast.success(`Uspješno uvezeno ${importedCards.length} kartica${extraMsg}.`);
      } catch (err) {
        toast.error(`Greška pri uvozu: ${err instanceof Error ? err.message : "Neispravan format fajla."}`);
      }
    },
    [setCardMap, setCategories, setSubcategories, updateSRSettings],
  );

  const importCards = useCallback(
    (newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
      const created = newCards.map((c) => createCard(c.question, c.sections, category));
      setCardMapState((prev) => {
        const next = { ...prev };
        created.forEach((c) => {
          next[c.id] = c;
        });
        schedulePersist({ type: "bulk", cards: created });
        return next;
      });
      if (!categories.includes(category)) setCategories((prev) => [...prev, category]);
    },
    [categories, setCategories],
  );

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
