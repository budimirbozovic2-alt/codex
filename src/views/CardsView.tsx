import { useState, useEffect, useMemo, useCallback } from "react";
import { idbLoadSettings } from "@/lib/db";
import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { useDebounce } from "@/hooks/useDebounce";


import { Card } from "@/lib/spaced-repetition";
import ScrollableRow from "@/components/ScrollableRow";
import CardList from "@/components/CardList";
import ShortcutsHint from "@/components/ShortcutsHint";
import { toast } from "sonner";
import { Plus, CheckSquare, BookOpen, X, Search, Flame, ArrowUpDown } from "lucide-react";

const CARDS_SHORTCUTS = [
  { keys: "Ctrl+K", description: "Globalna pretraga" },
];

export default function CardsView() {
  const {
    cards, categories, subcategories,
    deleteCard, bulkUpdateSubcategory, bulkUpdateChapter, reorderCards, updateCard, addKeyPart,
  } = useCardContext();
  const { setView, setEditingCard, handleToggleTag } = useUIContext();

  const [filterCategory, setFilterCategory] = useState<string | null>(() => {
    const deeplink = sessionStorage.getItem("sr-deeplink-category");
    if (deeplink) { sessionStorage.removeItem("sr-deeplink-category"); return deeplink; }
    try { return localStorage.getItem("codex-nav-category") || null; } catch { return null; }
  });
  const [filterSubcategory, setFilterSubcategory] = useState<string | null>(() => {
    try { return localStorage.getItem("codex-nav-subcategory") || null; } catch { return null; }
  });
  const [filterChapter, setFilterChapter] = useState<string | null>(() => {
    try { return localStorage.getItem("codex-nav-chapter") || null; } catch { return null; }
  });
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">("all");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSubcategory, setBulkSubcategory] = useState("");
  const [bulkChapter, setBulkChapter] = useState("");
  const [newBulkChapter, setNewBulkChapter] = useState("");
  const [scrollToCardId, setScrollToCardId] = useState<string | null>(() => {
    const id = sessionStorage.getItem("sr-scroll-to-card");
    if (id) sessionStorage.removeItem("sr-scroll-to-card");
    return id;
  });
  const [reorderMode, setReorderMode] = useState(false);
  const [storedChapterOrder, setStoredChapterOrder] = useState<string[]>([]);

  // Load stored chapter order from IDB when filter changes
  useEffect(() => {
    if (filterCategory && filterSubcategory) {
      const key = `chapters-${filterCategory}-${filterSubcategory}`;
      idbLoadSettings<string[]>(key, []).then(setStoredChapterOrder);
    } else {
      setStoredChapterOrder([]);
    }
  }, [filterCategory, filterSubcategory]);

  // Sync nav state to localStorage for cross-component persistence
  useEffect(() => {
    try {
      if (filterCategory) localStorage.setItem("codex-nav-category", filterCategory);
      else localStorage.removeItem("codex-nav-category");
      if (filterSubcategory) localStorage.setItem("codex-nav-subcategory", filterSubcategory);
      else localStorage.removeItem("codex-nav-subcategory");
      if (filterChapter) localStorage.setItem("codex-nav-chapter", filterChapter);
      else localStorage.removeItem("codex-nav-chapter");
    } catch { /* ignore */ }
  }, [filterCategory, filterSubcategory, filterChapter]);

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkApply = () => {
    if (selectedIds.size === 0 || !bulkSubcategory || !filterCategory) return;
    bulkUpdateSubcategory(Array.from(selectedIds), bulkSubcategory);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkSubcategory("");
  };

  const handleBulkChapterApply = () => {
    if (selectedIds.size === 0 || !filterCategory) return;
    const ch = newBulkChapter.trim() || bulkChapter;
    if (!ch) return;
    const updates = Array.from(selectedIds).map((id, i) => ({ id, chapter: ch, chapterOrder: i }));
    bulkUpdateChapter(updates);
    toast.success(`${selectedIds.size} kartica dodijeljeno u "${ch}"`);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkChapter("");
    setNewBulkChapter("");
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkSubcategory("");
    setBulkChapter("");
    setNewBulkChapter("");
  };

  const handleReorder = (orderedIds: string[]) => {
    reorderCards(orderedIds);
    toast.success("Redoslijed sačuvan.");
  };

  const toggleReorderMode = () => {
    if (!reorderMode && !filterCategory) {
      toast.info("Filtriraj po kategoriji da bi promijenio redoslijed.");
      return;
    }
    setReorderMode(v => !v);
    if (reorderMode) {
      // Exiting reorder mode
    } else {
      // Entering reorder mode - disable other modes
      exitSelectionMode();
    }
  };

  const bulkSubcats = filterCategory ? (subcategories[filterCategory] || []) : [];
  const availableSubcategories = filterCategory ? (subcategories[filterCategory] || []) : [];

  // Available chapters for context menu
  const availableChapters = useMemo(() => {
    const catFilter = filterCategory;
    const subFilter = filterSubcategory;
    const relevant = cards.filter(c => {
      if (catFilter && c.category !== catFilter) return false;
      if (subFilter && c.subcategory !== subFilter) return false;
      return !!c.chapter;
    });
    return Array.from(new Set(relevant.map(c => c.chapter!))).sort();
  }, [cards, filterCategory, filterSubcategory]);

  // Context menu: move category
  const handleMoveCategory = useCallback((cardId: string, category: string, subcategory?: string) => {
    updateCard(cardId, { category, subcategory: subcategory || "" });
    toast.success(`Kartica premještena u "${category}"${subcategory ? ` › ${subcategory}` : ""}`);
  }, [updateCard]);

  // Context menu: assign chapter
  const handleAssignChapter = useCallback((cardId: string, chapter: string) => {
    bulkUpdateChapter([{ id: cardId, chapter, chapterOrder: 0 }]);
    toast.success(`Glava "${chapter}" dodijeljena`);
  }, [bulkUpdateChapter]);

  // Context menu: clone to mnemonic workshop
  const handleCloneToMnemonic = useCallback((card: Card) => {
    import("@/lib/mnemonic-storage").then(({ createMnemonicCard, loadMnemonicCards, saveMnemonicCards }) => {
      const existing = loadMnemonicCards();
      const alreadyExists = existing.some(m => m.originalCardId === card.id);
      if (alreadyExists) {
        toast.info("Kartica je već u Mnemo radionici");
        return;
      }
      const sections = card.sections.map(s => ({ title: s.title, content: s.content }));
      const clone = createMnemonicCard(card.id, card.question, sections, card.category, card.subcategory, card.tags);
      saveMnemonicCards([...existing, clone]);
      handleToggleTag(card.id, "mnemonic");
      toast.success("Klonirano u Mnemo radionicu");
    });
  }, [handleToggleTag]);

  const handleEdit = (card: Card) => {
    sessionStorage.setItem("sr-scroll-to-card", card.id);
    setEditingCard(card);
    setView("edit");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-serif">Kartice</h2>
          <ShortcutsHint shortcuts={CARDS_SHORTCUTS} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleReorderMode}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${reorderMode ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
            title={reorderMode ? "Završi preuređivanje" : "Promijeni redoslijed"}
          >
            <ArrowUpDown className="h-4 w-4" />
            {reorderMode ? "Gotovo" : "Redoslijed"}
          </button>
          {!reorderMode && (
            <>
              <button
                onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${selectionMode ? "bg-secondary text-secondary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
              >
                {selectionMode ? <><X className="h-4 w-4" /> Otkaži</> : <><CheckSquare className="h-4 w-4" /> Označi</>}
              </button>
              <button onClick={() => setView("create")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
                <Plus className="h-4 w-4" /> Nova
              </button>
            </>
          )}
        </div>
      </div>

      {reorderMode && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
          <ArrowUpDown className="h-4 w-4 text-primary flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Povlači kartice da promijeniš redoslijed. Redoslijed se automatski čuva.
          </p>
        </div>
      )}

      {selectionMode && !reorderMode && (
        <div className="space-y-3 p-4 rounded-xl bg-secondary/50 border">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{selectedIds.size} označeno</span>
            <button
              onClick={() => {
                const allFiltered = cards.filter(c => {
                  if (filterCategory && c.category !== filterCategory) return false;
                  if (filterSubcategory && c.subcategory !== filterSubcategory) return false;
                  return true;
                });
                setSelectedIds(new Set(allFiltered.map(c => c.id)));
              }}
              className="text-xs text-primary hover:underline"
            >
              Označi sve
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:underline">
              Poništi
            </button>
          </div>

          {!filterCategory ? (
            <span className="text-xs text-muted-foreground">Filtriraj po kategoriji da bi koristio bulk operacije</span>
          ) : (
            <div className="space-y-2">
              {/* Bulk subcategory */}
              {bulkSubcats.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground w-24">Podkategorija:</span>
                  <select
                    value={bulkSubcategory}
                    onChange={(e) => setBulkSubcategory(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border bg-background text-sm flex-1 min-w-[150px]"
                  >
                    <option value="">Odaberi...</option>
                    {bulkSubcats.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                  </select>
                  <button
                    onClick={handleBulkApply}
                    disabled={selectedIds.size === 0 || !bulkSubcategory}
                    className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    Primijeni
                  </button>
                </div>
              )}

              {/* Bulk chapter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground w-24 flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Glava:
                </span>
                {(() => {
                  const existingChapters = Array.from(new Set(
                    cards.filter(c => c.category === filterCategory && c.chapter).map(c => c.chapter!)
                  )).sort();
                  return (
                    <>
                      {existingChapters.length > 0 && (
                        <select
                          value={bulkChapter}
                          onChange={(e) => { setBulkChapter(e.target.value); setNewBulkChapter(""); }}
                          className="px-3 py-1.5 rounded-lg border bg-background text-sm min-w-[150px]"
                        >
                          <option value="">Postojeća glava...</option>
                          {existingChapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                        </select>
                      )}
                      <span className="text-xs text-muted-foreground">ili</span>
                      <input
                        value={newBulkChapter}
                        onChange={e => { setNewBulkChapter(e.target.value); setBulkChapter(""); }}
                        placeholder="Nova glava..."
                        className="px-3 py-1.5 rounded-lg border bg-background text-sm flex-1 min-w-[120px]"
                      />
                      <button
                        onClick={handleBulkChapterApply}
                        disabled={selectedIds.size === 0 || (!bulkChapter && !newBulkChapter.trim())}
                        className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        Dodijeli
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Pretraži kartice..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="h-px bg-border" />

        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tip</span>
            <div className="flex gap-1">
              {(["all", "essay", "flash"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterType === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  {t === "all" ? "Sve" : t === "essay" ? "Esejska" : "Blic"}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-6 bg-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex gap-1">
              <button onClick={() => setFilterTag(null)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${!filterTag ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                Sve
              </button>
              <button onClick={() => setFilterTag(filterTag === "često-na-ispitu" ? null : "često-na-ispitu")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterTag === "često-na-ispitu" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                Često na ispitu
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kategorija</span>
          <ScrollableRow>
            <button onClick={() => { setFilterCategory(null); setFilterSubcategory(null); setFilterChapter(null); if (reorderMode) setReorderMode(false); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!filterCategory ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
              Sve
            </button>
            {categories.map(c => {
              const count = cards.filter(card => card.category === c).length;
              return (
                <button
                  key={c}
                  onClick={() => { setFilterCategory(c); setFilterSubcategory(null); setFilterChapter(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${filterCategory === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  {c}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filterCategory === c ? "bg-primary-foreground/20" : "bg-secondary"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </ScrollableRow>

          {filterCategory && (availableSubcategories.length > 0 || cards.some(c => c.category === filterCategory && !c.subcategory)) && (
            <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
              <button onClick={() => setFilterSubcategory(null)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${!filterSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                Sve podkat.
              </button>
              {cards.some(c => c.category === filterCategory && !c.subcategory) && (
                <button onClick={() => setFilterSubcategory("__none__")} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${filterSubcategory === "__none__" ? "bg-warning/15 text-warning" : "text-warning/70 hover:text-warning hover:bg-warning/10"}`}>
                  ⚠ Bez podkat.
                  <span className="text-[10px] px-1 py-0.5 rounded-full bg-warning/10">{cards.filter(c => c.category === filterCategory && !c.subcategory).length}</span>
                </button>
              )}
              {availableSubcategories.map(sc => (
                <button key={sc} onClick={() => setFilterSubcategory(sc)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${filterSubcategory === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {sc}
                </button>
              ))}
            </ScrollableRow>
          )}

          {filterSubcategory && (() => {
            const chaptersSet = new Set(
              cards.filter(c => c.category === filterCategory && c.subcategory === filterSubcategory && c.chapter)
                .map(c => c.chapter!)
            );
            // Use stored order from MentalSkeleton, append any new chapters
            const ordered = [...storedChapterOrder].filter(ch => chaptersSet.has(ch));
            chaptersSet.forEach(ch => { if (!ordered.includes(ch)) ordered.push(ch); });
            if (ordered.length === 0) return null;
            return (
              <ScrollableRow className="pl-6 border-l-2 border-primary/10 ml-1">
                <button onClick={() => setFilterChapter(null)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${!filterChapter ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  Sve glave
                </button>
                {ordered.map(ch => (
                  <button key={ch} onClick={() => setFilterChapter(ch)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${filterChapter === ch ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                    {ch}
                  </button>
                ))}
              </ScrollableRow>
            );
          })()}
        </div>
      </div>

      <CardList
        cards={cards}
        filterCategory={filterCategory}
        filterSubcategory={filterSubcategory}
        filterChapter={filterChapter}
        filterType={filterType}
        filterTag={filterTag}
        searchQuery={debouncedSearch}
        onEdit={handleEdit}
        onDelete={deleteCard}
        onToggleTag={handleToggleTag}
        scrollToCardId={scrollToCardId}
        onScrolledTo={() => setScrollToCardId(null)}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        reorderMode={reorderMode}
        onReorder={handleReorder}
        categories={categories}
        subcategories={subcategories}
        availableChapters={availableChapters}
        onMoveCategory={handleMoveCategory}
        onAssignChapter={handleAssignChapter}
        onCloneToMnemonic={handleCloneToMnemonic}
        onAddKeyPart={addKeyPart}
      />
    </div>
  );
}
