import { useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { useDebounce } from "@/hooks/useDebounce";
import { AnimatePresence, motion } from "framer-motion";
import { default as Plus } from "lucide-react/dist/esm/icons/plus";
import { default as CheckSquare } from "lucide-react/dist/esm/icons/check-square";
import { default as X } from "lucide-react/dist/esm/icons/x";
import { default as Search } from "lucide-react/dist/esm/icons/search";
import { default as Flame } from "lucide-react/dist/esm/icons/flame";
import { Card } from "@/lib/spaced-repetition";
import ScrollableRow from "@/components/ScrollableRow";
import CardList from "@/components/CardList";

export default function CardsView() {
  const {
    cards, categories, subcategories,
    deleteCard, handleToggleTag, bulkUpdateSubcategory,
    setView, setEditingCard,
  } = useAppContext();

  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSubcategory, setFilterSubcategory] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">("all");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSubcategory, setBulkSubcategory] = useState("");
  const [scrollToCardId, setScrollToCardId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
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

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkSubcategory("");
  };

  const bulkSubcats = filterCategory ? (subcategories[filterCategory] || []) : [];
  const availableSubcategories = filterCategory ? (subcategories[filterCategory] || []) : [];

  const handleEdit = (card: Card) => {
    setEditingCard(card);
    setView("edit");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-serif">Kartice</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${selectionMode ? "bg-secondary text-secondary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
          >
            {selectionMode ? <><X className="h-4 w-4" /> Otkaži</> : <><CheckSquare className="h-4 w-4" /> Označi</>}
          </button>
          <button onClick={() => setView("create")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Nova
          </button>
        </div>
      </div>

      {selectionMode && (
        <div className="flex items-center gap-3 flex-wrap p-4 rounded-xl bg-secondary/50 border">
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
          <div className="flex-1" />
          {!filterCategory ? (
            <span className="text-xs text-muted-foreground">Filtriraj po kategoriji da bi dodijelio podkategoriju</span>
          ) : bulkSubcats.length === 0 ? (
            <span className="text-xs text-muted-foreground">Nema podkategorija za "{filterCategory}"</span>
          ) : (
            <>
              <select
                value={bulkSubcategory}
                onChange={(e) => setBulkSubcategory(e.target.value)}
                className="px-3 py-1.5 rounded-lg border bg-background text-sm"
              >
                <option value="">Podkategorija...</option>
                {bulkSubcats.map(sc => <option key={sc} value={sc}>{sc}</option>)}
              </select>
              <button
                onClick={handleBulkApply}
                disabled={selectedIds.size === 0 || !bulkSubcategory}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Primijeni
              </button>
            </>
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
            <button onClick={() => { setFilterCategory(null); setFilterSubcategory(null); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!filterCategory ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
              Sve
            </button>
            {categories.map(c => {
              const count = cards.filter(card => card.category === c).length;
              return (
                <button
                  key={c}
                  onClick={() => { setFilterCategory(c); setFilterSubcategory(null); }}
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

          {filterCategory && availableSubcategories.length > 0 && (
            <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
              <button onClick={() => setFilterSubcategory(null)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${!filterSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                Sve podkat.
              </button>
              {availableSubcategories.map(sc => (
                <button key={sc} onClick={() => setFilterSubcategory(sc)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${filterSubcategory === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {sc}
                </button>
              ))}
            </ScrollableRow>
          )}
        </div>
      </div>

      <CardList
        cards={cards}
        filterCategory={filterCategory}
        filterSubcategory={filterSubcategory}
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
      />
    </div>
  );
}
