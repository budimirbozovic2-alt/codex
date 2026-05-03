import { useState, useCallback, useMemo, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Card } from "@/lib/spaced-repetition";
import type { FrequencyTag } from "@/lib/sr/types";
import { type CategoryRecord, type SubcategoryNode } from "@/lib/db";
import { toast } from "sonner";
import CardViewTable from "./CardViewTable";
import CardViewFilterBar, { type FrequencyFilterValue } from "./CardViewFilterBar";
import SubjectHierarchyTree from "./SubjectHierarchyTree";
import { MoveCardDialog } from "./CardViewDialogs";
import { useCardViewFilters, type FilterTypeValue } from "@/hooks/useCardViewFilters";

export interface CardViewFiltersSnapshot {
  subcategory: string;
  chapter: string;
  type: FilterTypeValue;
  frequency: FrequencyFilterValue;
}

interface Props {
  cards: Card[];
  categoryId: string;
  allCategories: CategoryRecord[];
  subcategoryNodes: SubcategoryNode[];
  patchCard: (id: string, fn: (c: Card) => Card) => void;
  setFrequency: (cardId: string, value: FrequencyTag | null) => void;
  addCard: (question: string, sections: { title: string; content: string }[], category: string, subcategory?: string, chapter?: string) => Card;
  addFlashCard: (question: string, answer: string, category: string, subcategory?: string) => Card;
  bulkAddFlashCards: (pairs: { question: string; answer: string }[], categoryId: string, subcategoryId?: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (card: Card) => void;
  onPassiveRead?: (card: Card) => void;
  masteryFilter?: number | null;
  onClearMasteryFilter?: () => void;
  externalQuery?: string;
  /** Initial filter values, restored from edit-return snapshot. */
  initialSubcategory?: string;
  initialChapter?: string;
  initialType?: FilterTypeValue;
  initialFrequency?: FrequencyFilterValue;
  /** Notified whenever any internal filter changes, so a parent can stash them. */
  onFiltersChange?: (snap: CardViewFiltersSnapshot) => void;
}

export default function CardViewMode({ cards, categoryId, allCategories, subcategoryNodes, patchCard, setFrequency, addCard, addFlashCard, bulkAddFlashCards, onDelete, onEdit, onPassiveRead, masteryFilter, onClearMasteryFilter, externalQuery, initialSubcategory, initialChapter, initialType, initialFrequency, onFiltersChange }: Props) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveCardId, setMoveCardId] = useState<string | null>(null);

  const filters = useCardViewFilters({
    cards,
    allCategories,
    categoryId,
    masteryFilter,
    onClearMasteryFilter,
    externalQuery,
    initialSubcategory,
    initialChapter,
    initialType,
    initialFrequency,
  });

  // Push current filter values up to the parent so they can be persisted in
  // the edit-return snapshot. Cheap object — no need to memoize.
  useEffect(() => {
    onFiltersChange?.({
      subcategory: filters.filterSubcategory,
      chapter: filters.filterChapter,
      type: filters.filterType,
      frequency: filters.filterFrequency,
    });
  }, [filters.filterSubcategory, filters.filterChapter, filters.filterType, filters.filterFrequency, onFiltersChange]);

  const otherCategories = useMemo(
    () => allCategories.filter(c => c.id !== categoryId),
    [allCategories, categoryId]
  );

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

  const handleBatchSetFrequency = useCallback((value: FrequencyTag | null) => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    selectedIds.forEach(id => setFrequency(id, value));
    if (value === null) {
      toast.success(`Uklonjen tag sa ${count} kartica.`);
    } else {
      toast.success(`Označeno ${count} kartica kao "${value}".`);
    }
  }, [selectedIds, setFrequency]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const confirmMove = useCallback((targetCategoryId: string) => {
    if (!moveCardId) return;
    patchCard(moveCardId, c => ({ ...c, categoryId: targetCategoryId }));
    setMoveCardId(null);
  }, [moveCardId, patchCard]);

  if (cards.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">
          Nema kartica u ovoj kategoriji. Koristi dugme „Dodaj" u zaglavlju.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-4 lg:self-start min-w-0">
        <SubjectHierarchyTree
          subcategoryNodes={subcategoryNodes}
          totalCount={cards.length}
          subcategoryCounts={filters.subcategoryCounts}
          chapterCounts={filters.chapterCounts}
          selectedSubcategoryId={filters.filterSubcategory}
          selectedChapterId={filters.filterChapter}
          onSelectAll={() => filters.changeSubcategory("__all__")}
          onSelectSubcategory={(id) => {
            filters.changeSubcategory(id);
          }}
          onSelectChapter={(subId, chId) => {
            filters.changeSubcategory(subId);
            filters.setFilterChapter(chId);
          }}
          storageKey={`subj-tree-expanded:${categoryId}`}
        />
      </aside>

      <div className="space-y-3 min-w-0">
        <CardViewFilterBar
          filterType={filters.filterType}
          onChangeType={filters.setFilterType}
          filterFrequency={filters.filterFrequency}
          onChangeFrequency={filters.setFilterFrequency}
          masteryFilter={masteryFilter}
          onClearMasteryFilter={onClearMasteryFilter}
          hasActiveFilters={filters.hasActiveFilters}
          onResetFilters={filters.resetFilters}
          filteredCount={filters.filteredCards.length}
          totalCount={cards.length}
          selectionMode={selectionMode}
          onToggleSelectionMode={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
          onDelete={onDelete}
        />

        {selectionMode && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-2.5">
            <span className="text-xs font-medium text-foreground">{selectedIds.size} izabrano</span>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set(filters.filteredCards.map(c => c.id)))} className="h-7 gap-1.5 text-xs">
              Označi sve ({filters.filteredCards.length})
            </Button>
            {selectedIds.size > 0 && (
              <>
                <span className="h-4 w-px bg-border" aria-hidden />
                <span className="text-xs text-muted-foreground">Označi kao:</span>
                <Button variant="default" size="sm" onClick={() => handleBatchSetFrequency("često")} className="h-7 text-xs" aria-label="Označi kao često">
                  Često
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleBatchSetFrequency("rijetko")} className="h-7 text-xs" aria-label="Označi kao rijetko">
                  Rijetko
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleBatchSetFrequency("nikad")} className="h-7 text-xs" aria-label="Označi kao nikad">
                  Nikad
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleBatchSetFrequency(null)} className="h-7 text-xs" aria-label="Ukloni tag">
                  Bez taga
                </Button>
                <span className="h-4 w-px bg-border" aria-hidden />
                <Button variant="destructive" size="sm" onClick={handleBatchDelete} className="h-7 gap-1.5 text-xs">
                  <Trash2 className="h-3.5 w-3.5" /> Obriši izabrane
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={exitSelectionMode} className="h-7 text-xs ml-auto">
              Otkaži
            </Button>
          </div>
        )}

        <CardViewTable
          filteredCards={filters.filteredCards}
          allCategories={allCategories}
          expandedId={expandedId}
          onToggle={toggle}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          setFrequency={setFrequency}
          onEdit={onEdit}
          onPassiveRead={onPassiveRead}
          onDelete={onDelete}
          onOpenMoveModal={(cardId) => { setMoveCardId(cardId); setMoveModalOpen(true); }}
          hasActiveFilters={filters.hasActiveFilters}
          totalCount={cards.length}
          onResetFilters={filters.resetFilters}
        />

        <MoveCardDialog
          open={moveModalOpen}
          onOpenChange={setMoveModalOpen}
          otherCategories={otherCategories}
          onConfirm={confirmMove}
        />
      </div>
    </div>
  );
}
