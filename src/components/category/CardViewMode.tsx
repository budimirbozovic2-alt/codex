import { useState, useCallback, useMemo } from "react";
import { Filter, X, Plus, Upload, CheckSquare, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Card, CARD_TAGS } from "@/lib/spaced-repetition";
import { type CategoryRecord } from "@/lib/db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CardViewTable from "./CardViewTable";
import { AddCardDialog, MoveCardDialog, BulkImportWrapper } from "./CardViewDialogs";

interface Props {
  cards: Card[];
  categoryId: string;
  allCategories: CategoryRecord[];
  patchCard: (id: string, fn: (c: Card) => Card) => void;
  toggleTag: (cardId: string, tag: string) => void;
  addCard: (question: string, sections: { title: string; content: string }[], category: string, subcategory?: string, chapter?: string) => Card;
  addFlashCard: (question: string, answer: string, category: string, subcategory?: string) => Card;
  onDelete?: (id: string) => void;
  onEdit?: (card: Card) => void;
}

export default function CardViewMode({ cards, categoryId, allCategories, patchCard, toggleTag, addCard, addFlashCard, onDelete, onEdit }: Props) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveCardId, setMoveCardId] = useState<string | null>(null);

  // Filter state
  const [filterSubcategory, setFilterSubcategory] = useState<string>("__all__");
  const [filterChapter, setFilterChapter] = useState<string>("__all__");
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash" | "mnemonic">("all");
  const [filterTag, setFilterTag] = useState<string>("__all__");

  const otherCategories = useMemo(
    () => allCategories.filter(c => c.id !== categoryId),
    [allCategories, categoryId]
  );

  // UUID→name lookup from category records
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    const catRec = allCategories.find(c => c.id === categoryId);
    if (catRec) {
      for (const sub of catRec.subcategories ?? []) {
        m[sub.id] = sub.name;
        for (const ch of sub.chapters ?? []) m[ch.id] = ch.name;
      }
    }
    return m;
  }, [allCategories, categoryId]);

  const subcategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach(c => { if (c.subcategoryId) counts[c.subcategoryId] = (counts[c.subcategoryId] || 0) + 1; });
    return counts;
  }, [cards]);

  const uniqueSubcategories = useMemo(() => {
    return Object.keys(subcategoryCounts).sort((a, b) => (nameMap[a] ?? a).localeCompare(nameMap[b] ?? b));
  }, [subcategoryCounts, nameMap]);

  const chapterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach(c => {
      if (filterSubcategory !== "__all__" && c.subcategoryId !== filterSubcategory) return;
      if (c.chapterId) counts[c.chapterId] = (counts[c.chapterId] || 0) + 1;
    });
    return counts;
  }, [cards, filterSubcategory]);

  const uniqueChapters = useMemo(() => {
    return Object.keys(chapterCounts).sort((a, b) => (nameMap[a] ?? a).localeCompare(nameMap[b] ?? b));
  }, [chapterCounts, nameMap]);

  const filteredCards = useMemo(() => {
    return cards.filter(c => {
      if (filterSubcategory !== "__all__" && (c.subcategoryId || "") !== filterSubcategory) return false;
      if (filterChapter !== "__all__" && (c.chapterId || "") !== filterChapter) return false;
      if (filterType === "essay" && c.type !== "essay") return false;
      if (filterType === "flash" && c.type !== "flash") return false;
      if (filterType === "mnemonic" && !(c.tags?.includes("mnemonic"))) return false;
      if (filterTag !== "__all__" && !(c.tags?.includes(filterTag))) return false;
      return true;
    });
  }, [cards, filterSubcategory, filterChapter, filterType, filterTag]);

  const hasActiveFilters = filterSubcategory !== "__all__" || filterChapter !== "__all__" || filterType !== "all" || filterTag !== "__all__";

  const resetFilters = useCallback(() => {
    setFilterSubcategory("__all__");
    setFilterChapter("__all__");
    setFilterType("all");
    setFilterTag("__all__");
  }, []);

  const toggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBatchDelete = useCallback(() => {
    if (!onDelete || selectedIds.size === 0) return;
    const count = selectedIds.size;
    selectedIds.forEach(id => onDelete(id));
    setSelectedIds(new Set());
    setSelectionMode(false);
    toast.success(`Obrisano ${count} kartica.`);
  }, [onDelete, selectedIds]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const confirmMove = useCallback((targetCategoryId: string) => {
    if (!moveCardId) return;
    patchCard(moveCardId, c => ({ ...c, categoryId: targetCategoryId }));
    setMoveCardId(null);
  }, [moveCardId, patchCard]);

  if (cards.length === 0 && !addDialogOpen) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-sm text-muted-foreground">Nema kartica u ovoj kategoriji.</p>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova kartica
        </Button>
        <AddCardDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} categoryId={categoryId} addCard={addCard} addFlashCard={addFlashCard} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter toolbar */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card p-2.5">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        {uniqueSubcategories.length > 0 && (
          <Select value={filterSubcategory} onValueChange={(v) => { setFilterSubcategory(v); setFilterChapter("__all__"); }}>
            <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs">
              <SelectValue placeholder="Potkategorija" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Sve potkategorije</SelectItem>
              {uniqueSubcategories.map(sub => (
                <SelectItem key={sub} value={sub} className="text-xs">{nameMap[sub] ?? sub} ({subcategoryCounts[sub]})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {uniqueChapters.length > 0 && (
          <Select value={filterChapter} onValueChange={setFilterChapter}>
            <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
              <SelectValue placeholder="Glava" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Sve glave</SelectItem>
              {uniqueChapters.map(ch => (
                <SelectItem key={ch} value={ch} className="text-xs">{nameMap[ch] ?? ch}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          {(["all", "essay", "flash", "mnemonic"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                filterType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "all" ? "Sve" : t === "essay" ? "Esej" : t === "flash" ? "Blic" : "Mnemo"}
            </button>
          ))}
        </div>

        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="h-7 w-auto min-w-[110px] text-xs">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Svi tagovi</SelectItem>
            {CARD_TAGS.map(tag => (
              <SelectItem key={tag.id} value={tag.id} className="text-xs">{tag.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-muted-foreground">{filteredCards.length}/{cards.length}</span>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-6 px-2 text-[10px] gap-1">
              <X className="h-3 w-3" /> Reset
            </Button>
          )}
          {onDelete && (
            <Button
              variant={selectionMode ? "secondary" : "outline"}
              size="sm"
              onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
              className="h-7 gap-1.5 text-xs"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectionMode ? "Otkaži" : "Izaberi"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)} className="h-7 gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" /> Masovni Import
          </Button>
          <Button variant="default" size="sm" onClick={() => setAddDialogOpen(true)} className="h-7 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Nova kartica
          </Button>
        </div>
      </div>

      {/* Batch delete toolbar */}
      {selectionMode && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-2.5">
          <span className="text-xs font-medium text-foreground">{selectedIds.size} izabrano</span>
          <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set(filteredCards.map(c => c.id)))} className="h-7 gap-1.5 text-xs">
            Označi sve ({filteredCards.length})
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBatchDelete} className="h-7 gap-1.5 text-xs">
              <Trash2 className="h-3.5 w-3.5" /> Obriši izabrane
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={exitSelectionMode} className="h-7 text-xs">
            Otkaži
          </Button>
        </div>
      )}

      {/* Card table */}
      <CardViewTable
        filteredCards={filteredCards}
        allCategories={allCategories}
        expandedId={expandedId}
        onToggle={toggle}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelection={toggleSelection}
        toggleTag={toggleTag}
        onEdit={onEdit}
        onDelete={onDelete}
        onOpenMoveModal={(cardId) => { setMoveCardId(cardId); setMoveModalOpen(true); }}
        hasActiveFilters={hasActiveFilters}
        totalCount={cards.length}
        onResetFilters={resetFilters}
      />

      {/* Dialogs */}
      <MoveCardDialog
        open={moveModalOpen}
        onOpenChange={setMoveModalOpen}
        otherCategories={otherCategories}
        onConfirm={confirmMove}
      />
      <AddCardDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} categoryId={categoryId} addCard={addCard} addFlashCard={addFlashCard} />
      <BulkImportWrapper open={bulkImportOpen} onOpenChange={setBulkImportOpen} categoryId={categoryId} addFlashCard={addFlashCard} />
    </div>
  );
}
