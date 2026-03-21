import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, createCard, createFlashCard, createSection, calculateNextReview, getDueCards, getStats, getCategoryStats, SRSettings, DEFAULT_SR_SETTINGS, ErrorLogEntry } from "@/lib/spaced-repetition";
import { ReviewLogEntry, setLastBackupTime } from "@/lib/storage";
import {
  migrateFromLocalStorage,
  idbLoadCards, idbSaveCards,
  idbPutCard, idbDeleteCard, idbBulkPutCards,
  idbLoadCategories, idbSaveCategories,
  idbLoadSubcategories, idbSaveSubcategories,
  idbLoadReviewLog, idbAddReviewLogEntry,
  idbLoadSettings, idbSaveSettings,
} from "@/lib/db";

// ─── Internal Map type for O(1) access ──────────────────
type CardMap = Record<string, Card>;

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

const pendingActions: PersistAction[] = [];
let flushTimer: number | null = null;

function schedulePersist(action: PersistAction) {
  pendingActions.push(action);
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(flushPersist, 16); // batch within a frame
}

async function flushPersist() {
  flushTimer = null;
  const actions = pendingActions.splice(0);
  if (actions.length === 0) return;

  // If any action is "full", just do full save
  const fullAction = actions.find(a => a.type === "full");
  if (fullAction && fullAction.type === "full") {
    await idbSaveCards(mapToArray(fullAction.map));
    return;
  }

  // Otherwise, surgical puts and deletes
  const puts: Card[] = [];
  const deletes: string[] = [];
  for (const a of actions) {
    if (a.type === "put") puts.push(a.card);
    else if (a.type === "delete") deletes.push(a.id);
    else if (a.type === "bulk") puts.push(...a.cards);
  }

  if (puts.length > 0) await idbBulkPutCards(puts);
  for (const id of deletes) await idbDeleteCard(id);
}

export function useCards() {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [categories, setCategoriesState] = useState<string[]>(["Opšte"]);
  const [subcategories, setSubcategoriesState] = useState<Record<string, string[]>>({});
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);
  const [ready, setReady] = useState(false);
  const initialLoadDone = useRef(false);

  // ── Initial async load from IndexedDB ──
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const splashProgress = (pct: number, label: string) => {
      const bar = document.getElementById("splash-progress");
      const status = document.getElementById("splash-status");
      const percent = document.getElementById("splash-percent");
      if (bar) bar.style.width = `${pct}%`;
      if (status) status.textContent = label;
      if (percent) percent.textContent = `${pct}%`;
    };

    (async () => {
      splashProgress(10, "Migracija podataka…");
      await migrateFromLocalStorage();

      splashProgress(25, "Učitavanje kartica…");
      const c = await idbLoadCards();

      splashProgress(50, `${c.length} kartica učitano`);
      const cats = await idbLoadCategories();

      splashProgress(65, "Učitavanje kategorija…");
      const subs = await idbLoadSubcategories();

      splashProgress(80, "Učitavanje dnevnika…");
      const log = await idbLoadReviewLog();

      splashProgress(90, "Učitavanje podešavanja…");
      const settings = await idbLoadSettings<SRSettings>("srSettings", DEFAULT_SR_SETTINGS);

      setCardMapState(arrayToMap(c));
      setCategoriesState(cats);
      setSubcategoriesState(subs);
      setReviewLogState(log);
      setSrSettingsState(settings);

      splashProgress(100, "Spremno!");
      setReady(true);
    })();
  }, []);

  // ── Derived: Card[] for consumers (memoized from map) ──
  const cards = useMemo(() => mapToArray(cardMap), [cardMap]);

  // ── Surgical single-card update (O(1) state + O(1) IDB) ──
  const patchCard = useCallback((id: string, patcher: (card: Card) => Card) => {
    setCardMapState(prev => {
      const card = prev[id];
      if (!card) return prev;
      const updated = patcher(card);
      schedulePersist({ type: "put", card: updated });
      return { ...prev, [id]: updated };
    });
  }, []);

  // ── Bulk map update (for operations touching many cards) ──
  const setCardMap = useCallback((updater: (prev: CardMap) => CardMap, persist: "surgical" | "full" = "full") => {
    setCardMapState(prev => {
      const next = updater(prev);
      if (persist === "full") {
        schedulePersist({ type: "full", map: next });
      }
      return next;
    });
  }, []);

  const setCategories = useCallback((updater: (prev: string[]) => string[]) => {
    setCategoriesState(prev => {
      const next = updater(prev);
      idbSaveCategories(next);
      return next;
    });
  }, []);

  const setSubcategories = useCallback((updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    setSubcategoriesState(prev => {
      const next = updater(prev);
      idbSaveSubcategories(next);
      return next;
    });
  }, []);

  const setReviewLog = useCallback((updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
    setReviewLogState(prev => updater(prev));
  }, []);

  // ── Actions ──
  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    idbSaveSettings("srSettings", settings);
  }, []);

  const addCard = useCallback((question: string, sections: { title: string; content: string }[], category: string, subcategory?: string) => {
    const card = createCard(question, sections, category, subcategory);
    setCardMapState(prev => {
      schedulePersist({ type: "put", card });
      return { ...prev, [card.id]: card };
    });
    if (!categories.includes(category)) {
      setCategories(prev => [...prev, category]);
    }
    return card;
  }, [categories, setCategories]);

  const addFlashCard = useCallback((question: string, answer: string, category: string, subcategory?: string) => {
    const card = createFlashCard(question, answer, category, subcategory);
    setCardMapState(prev => {
      schedulePersist({ type: "put", card });
      return { ...prev, [card.id]: card };
    });
    if (!categories.includes(category)) {
      setCategories(prev => [...prev, category]);
    }
    return card;
  }, [categories, setCategories]);

  // O(1) direct update — surgical IDB write
  const updateCard = useCallback((id: string, updates: { question?: string; sections?: { title: string; content: string }[]; category?: string; subcategory?: string }) => {
    patchCard(id, c => {
      const newCard = { ...c };
      if (updates.question) newCard.question = updates.question;
      if (updates.category) newCard.category = updates.category;
      if (updates.subcategory !== undefined) newCard.subcategory = updates.subcategory;
      if (updates.sections) {
        newCard.sections = updates.sections.map(s => {
          const existing = c.sections.find(es => es.title === s.title);
          if (existing) return { ...existing, content: s.content };
          return createSection(s.title, s.content);
        });
      }
      return newCard;
    });
    toast.success("Kartica ažurirana.");
  }, [patchCard]);

  // O(1) delete — surgical IDB delete
  const deleteCard = useCallback((id: string) => {
    setCardMapState(prev => {
      const next = { ...prev };
      delete next[id];
      schedulePersist({ type: "delete", id });
      return next;
    });
    toast.success("Kartica obrisana.");
  }, []);

  // O(1) review — surgical IDB write
  const reviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
    patchCard(cardId, c => {
      const entry: ReviewLogEntry = { timestamp: Date.now(), cardId, sectionId, grade, category: c.category };
      idbAddReviewLogEntry(entry);
      setReviewLog(log => [...log, entry]);

      let errorLog = c.errorLog;
      if (errorLog && errorLog.length > 0 && grade >= 3) {
        errorLog = errorLog.map(e => ({ ...e, recentSuccesses: (e.recentSuccesses || 0) + 1, successStreak: (e.successStreak || 0) + 1 }));
      } else if (errorLog && errorLog.length > 0 && grade === 1) {
        errorLog = errorLog.map(e => ({ ...e, successStreak: 0 }));
      }

      return {
        ...c,
        ...(errorLog ? { errorLog } : {}),
        sections: c.sections.map(s => s.id !== sectionId ? s : { ...s, ...calculateNextReview(s, grade) }),
      };
    });
  }, [patchCard, setReviewLog]);

  const splitCard = useCallback((id: string) => {
    setCardMapState(prev => {
      const card = prev[id];
      if (!card || card.sections.length <= 1) return prev;
      const next = { ...prev };
      delete next[id];
      schedulePersist({ type: "delete", id });
      const newCards: Card[] = [];
      card.sections.forEach(section => {
        const newCard = { ...createCard(card.question, [{ title: section.title, content: section.content }], card.category, card.subcategory), sections: [{ ...section }] };
        next[newCard.id] = newCard;
        newCards.push(newCard);
      });
      schedulePersist({ type: "bulk", cards: newCards });
      return next;
    });
  }, []);

  const addCategory = useCallback((name: string) => {
    if (!categories.includes(name)) setCategories(prev => [...prev, name]);
  }, [categories, setCategories]);

  const renameCategory = useCallback((oldName: string, newName: string) => {
    if (categories.includes(newName)) return;
    setCategories(prev => prev.map(c => c === oldName ? newName : c));
    setCardMap(prev => {
      const next: CardMap = {};
      for (const [id, c] of Object.entries(prev)) {
        next[id] = c.category === oldName ? { ...c, category: newName } : c;
      }
      return next;
    }, "full");
    setSubcategories(prev => {
      const next = { ...prev };
      if (next[oldName]) { next[newName] = next[oldName]; delete next[oldName]; }
      return next;
    });
  }, [categories, setCategories, setCardMap, setSubcategories]);

  const deleteCategory = useCallback((name: string) => {
    setCategories(prev => prev.filter(c => c !== name));
    setCardMap(prev => {
      const next: CardMap = {};
      for (const [id, c] of Object.entries(prev)) {
        next[id] = c.category === name ? { ...c, category: "Opšte", subcategory: "" } : c;
      }
      return next;
    }, "full");
    setSubcategories(prev => { const next = { ...prev }; delete next[name]; return next; });
  }, [setCategories, setCardMap, setSubcategories]);

  const addSubcategory = useCallback((category: string, subcategory: string) => {
    setSubcategories(prev => {
      const list = prev[category] || [];
      if (list.includes(subcategory)) return prev;
      return { ...prev, [category]: [...list, subcategory] };
    });
  }, [setSubcategories]);

  const renameSubcategory = useCallback((category: string, oldName: string, newName: string) => {
    setSubcategories(prev => {
      const list = prev[category] || [];
      if (list.includes(newName)) return prev;
      return { ...prev, [category]: list.map(s => s === oldName ? newName : s) };
    });
    setCardMap(prev => {
      const next: CardMap = {};
      for (const [id, c] of Object.entries(prev)) {
        next[id] = c.category === category && c.subcategory === oldName ? { ...c, subcategory: newName } : c;
      }
      return next;
    }, "full");
  }, [setSubcategories, setCardMap]);

  const deleteSubcategory = useCallback((category: string, subcategory: string) => {
    setSubcategories(prev => ({ ...prev, [category]: (prev[category] || []).filter(s => s !== subcategory) }));
    setCardMap(prev => {
      const next: CardMap = {};
      for (const [id, c] of Object.entries(prev)) {
        next[id] = c.category === category && c.subcategory === subcategory ? { ...c, subcategory: "" } : c;
      }
      return next;
    }, "full");
  }, [setSubcategories, setCardMap]);

  // O(1) markRead — surgical
  const markRead = useCallback((id: string) => {
    patchCard(id, c => ({ ...c, readCount: (c.readCount || 0) + 1 }));
  }, [patchCard]);

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategory: string) => {
    setCardMapState(prev => {
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
    setCardMapState(prev => {
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

  // O(1) toggleTag — surgical
  const toggleTag = useCallback((cardId: string, tag: string) => {
    patchCard(cardId, c => {
      const tags = c.tags || [];
      return { ...c, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] };
    });
  }, [patchCard]);

  // O(1) logError — surgical
  const logError = useCallback((cardId: string, text: string) => {
    patchCard(cardId, c => {
      const errorLog = [...(c.errorLog || [])];
      const existing = errorLog.find(e => e.text === text);
      if (existing) {
        existing.count += 1;
        existing.lastMissed = new Date().toISOString();
        existing.successStreak = 0;
      } else {
        errorLog.push({ text, count: 1, recentSuccesses: 0, successStreak: 0, category: c.category, lastMissed: new Date().toISOString() });
      }
      const sections = c.sections.map(s => ({ ...s, difficulty: Math.min(10, s.difficulty + 0.5), stability: Math.max(0.1, s.stability * 0.85) }));
      return { ...c, errorLog, sections };
    });
  }, [patchCard]);

  // O(1) clearErrorLog — surgical
  const clearErrorLog = useCallback((cardId: string) => {
    patchCard(cardId, c => ({ ...c, errorLog: [] }));
  }, [patchCard]);

  const downloadFile = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Chunked JSON builder to avoid memory spikes on large datasets
  const buildJsonChunked = useCallback(async (data: object, onProgress: (p: number, msg: string) => void): Promise<string> => {
    onProgress(10, "Priprema podataka...");
    await new Promise(r => setTimeout(r, 30));

    const dataAny = data as any;
    const cardsArr: any[] = dataAny.cards || [];
    const CHUNK = 500;
    const parts: string[] = [];

    // Build cards array in chunks
    for (let i = 0; i < cardsArr.length; i += CHUNK) {
      const chunk = cardsArr.slice(i, i + CHUNK);
      parts.push(...chunk.map((c: any) => JSON.stringify(c)));
      const pct = 10 + Math.round((i / cardsArr.length) * 60);
      onProgress(pct, `Serijalizacija kartica... ${Math.min(i + CHUNK, cardsArr.length)}/${cardsArr.length}`);
      await new Promise(r => setTimeout(r, 10)); // yield to UI
    }

    onProgress(75, "Finalizacija JSON-a...");
    await new Promise(r => setTimeout(r, 20));

    const rest = { ...dataAny };
    delete rest.cards;
    const restJson = JSON.stringify(rest);
    // Merge: {"cards":[...chunk1,chunk2...],"rest":"..."}
    const cardsJson = `[${parts.join(",")}]`;
    const json = `${restJson.slice(0, -1)},"cards":${cardsJson}}`;
    return json;
  }, []);

  const exportTemplate = useCallback(async (compress: boolean, onProgress: (p: number, msg: string) => void) => {
    const templateCards = cards.map(c => ({
      id: c.id, question: c.question,
      sections: c.sections.map(s => ({ title: s.title, content: s.content })),
      category: c.category, subcategory: c.subcategory || "", type: c.type, tags: c.tags || [],
    }));
    const data = { version: 2, type: "template", cards: templateCards, categories, subcategories };
    const dateStr = new Date().toISOString().slice(0, 10);

    const json = await buildJsonChunked(data, onProgress);

    if (compress) {
      onProgress(85, "Kompresija...");
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file(`memoria-template-${dateStr}.json`, json);
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      onProgress(100, "Preuzimanje...");
      downloadFile(blob, `memoria-template-${dateStr}.zip`);
      toast.success("Template uspješno exportovan.");
    } else {
      onProgress(100, "Preuzimanje...");
      downloadFile(new Blob([json], { type: "application/json" }), `memoria-template-${dateStr}.json`);
      toast.success("Template uspješno exportovan.");
    }
  }, [cards, categories, subcategories, downloadFile, buildJsonChunked]);

  const exportData = useCallback(async (compress: boolean, onProgress: (p: number, msg: string) => void) => {
    const data = { version: 2, type: "full", cards, categories, subcategories, reviewLog, srSettings };
    const dateStr = new Date().toISOString().slice(0, 10);

    const json = await buildJsonChunked(data, onProgress);

    if (compress) {
      onProgress(85, "Kompresija...");
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file(`memoria-backup-${dateStr}.json`, json);
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      onProgress(100, "Preuzimanje...");
      downloadFile(blob, `memoria-backup-${dateStr}.zip`);
      toast.success("Pun backup uspješno exportovan.");
    } else {
      onProgress(100, "Preuzimanje...");
      downloadFile(new Blob([json], { type: "application/json" }), `memoria-backup-${dateStr}.json`);
      toast.success("Pun backup uspješno exportovan.");
    }
    setLastBackupTime();
  }, [cards, categories, subcategories, reviewLog, srSettings, downloadFile, buildJsonChunked]);

  const importData = useCallback(async (file: File, strategy: "keep" | "overwrite" | "skip" | "newer" = "skip") => {
    try {
      let jsonText: string;
      if (file.name.endsWith(".zip")) {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file);
        const jsonFile = Object.keys(zip.files).find(n => n.endsWith(".json"));
        if (!jsonFile) { toast.error("ZIP ne sadrži JSON fajl."); return; }
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

      const migrateImported = (c: any): Card => ({
        ...c, readCount: c.readCount || 0, type: c.type || "essay", subcategory: c.subcategory || "",
        tags: c.tags || [], errorLog: c.errorLog || [],
        sections: (c.sections || []).map((s: any) => ({
          ...s, id: s.id || crypto.randomUUID(), state: s.state ?? 0, lapses: s.lapses || 0,
          stability: s.stability ?? 0, difficulty: s.difficulty ?? 5, interval: s.interval ?? 0,
          nextReview: s.nextReview ?? 0, lastReviewed: s.lastReviewed ?? null,
          elapsedDays: s.elapsedDays ?? 0, scheduledDays: s.scheduledDays ?? 0,
        })),
      });

      const importedCards: Card[] = parsed.cards.map(migrateImported);
      setCardMap(prev => {
        const next = { ...prev };
        if (strategy === "newer") {
          const getLastReview = (c: Card) => Math.max(0, ...c.sections.map(s => s.lastReviewed || 0));
          importedCards.forEach(ic => {
            const existing = next[ic.id];
            if (!existing) { next[ic.id] = ic; }
            else if (getLastReview(ic) > getLastReview(existing)) { next[ic.id] = ic; }
          });
        } else if (strategy === "overwrite") {
          importedCards.forEach(ic => { next[ic.id] = ic; });
        } else {
          importedCards.forEach(ic => { if (!next[ic.id]) next[ic.id] = ic; });
        }
        return next;
      }, "full");

      if (Array.isArray(parsed.categories)) {
        setCategories(prev => [...new Set([...prev, ...parsed.categories])]);
      }
      if (parsed.subcategories && typeof parsed.subcategories === "object") {
        setSubcategories(prev => {
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

      toast.success(`Uspješno uvezeno ${importedCards.length} kartica.`);
    } catch (err) {
      toast.error(`Greška pri uvozu: ${err instanceof Error ? err.message : "Neispravan format fajla."}`);
    }
  }, [setCardMap, setCategories, setSubcategories, updateSRSettings]);

  const importCards = useCallback((newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
    const created = newCards.map(c => createCard(c.question, c.sections, category));
    setCardMapState(prev => {
      const next = { ...prev };
      created.forEach(c => { next[c.id] = c; });
      schedulePersist({ type: "bulk", cards: created });
      return next;
    });
    if (!categories.includes(category)) setCategories(prev => [...prev, category]);
  }, [categories, setCategories]);

  // ── Derived data ──
  const cardCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach(cat => { counts[cat] = 0; });
    cards.forEach(c => { counts[c.category] = (counts[c.category] || 0) + 1; });
    return counts;
  }, [cards, categories]);

  const dueCards = useMemo(() => getDueCards(cards), [cards]);
  const stats = useMemo(() => getStats(cards), [cards]);
  const categoryStats = useMemo(() =>
    Object.fromEntries(categories.map(cat => [cat, getCategoryStats(cards, cat)])),
    [cards, categories]
  );

  return {
    cards, categories, subcategories, dueCards, stats, categoryStats, cardCountByCategory, reviewLog, srSettings, ready,
    addCard, addFlashCard, updateCard, deleteCard, splitCard, reviewSection, markRead, toggleTag, bulkUpdateSubcategory, reorderCards, logError, clearErrorLog,
    exportData, exportTemplate, importData, importCards,
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    updateSRSettings,
  };
}
