import { useState, useCallback, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Card } from "@/lib/spaced-repetition";
import { type CategoryRecord, type SubcategoryNode } from "@/lib/db";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import CardViewTable from "./CardViewTable";
import CardViewFilterBar from "./CardViewFilterBar";
import SubjectHierarchyTree from "./SubjectHierarchyTree";
import { AddCardDialog, MoveCardDialog, BulkImportWrapper } from "./CardViewDialogs";
import { useCardViewFilters } from "@/hooks/useCardViewFilters";

interface Props {
  cards: Card[];
  categoryId: string;
  allCategories: CategoryRecord[];
  subcategoryNodes: SubcategoryNode[];
  patchCard: (id: string, fn: (c: Card) => Card) => void;
  toggleTag: (cardId: string, tag: string) => void;
  addCard: (question: string, sections: { title: string; content: string }[], category: string, subcategory?: string, chapter?: string) => Card;
  addFlashCard: (question: string, answer: string, category: string, subcategory?: string) => Card;
  onDelete?: (id: string) => void;
  onEdit?: (card: Card) => void;
  onPassiveRead?: (card: Card) => void;
  masteryFilter?: number | null;
  onClearMasteryFilter?: () => void;
  externalQuery?: string;
  externalSourceId?: string;
}

export default function CardViewMode({ cards, categoryId, allCategories, subcategoryNodes, patchCard, toggleTag, addCard, addFlashCard, onDelete, onEdit, onPassiveRead, masteryFilter, onClearMasteryFilter, externalQuery, externalSourceId }: Props) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveCardId, setMoveCardId] = useState<string | null>(null);

  const filters = useCardViewFilters({ cards, allCategories, categoryId, masteryFilter, onClearMasteryFilter, externalQuery, externalSourceId });

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
          filterTag={filters.filterTag}
          onChangeTag={filters.setFilterTag}
          masteryFilter={masteryFilter}
          onClearMasteryFilter={onClearMasteryFilter}
          hasActiveFilters={filters.hasActiveFilters}
          onResetFilters={filters.resetFilters}
          filteredCount={filters.filteredCards.length}
          totalCount={cards.length}
          selectionMode={selectionMode}
          onToggleSelectionMode={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
          onBulkImport={() => setBulkImportOpen(true)}
          onAddCard={() => setAddDialogOpen(true)}
          onDelete={onDelete}
        />

        {selectionMode && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-2.5">
            <span className="text-xs font-medium text-foreground">{selectedIds.size} izabrano</span>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set(filters.filteredCards.map(c => c.id)))} className="h-7 gap-1.5 text-xs">
              Označi sve ({filters.filteredCards.length})
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

        <CardViewTable
          filteredCards={filters.filteredCards}
          allCategories={allCategories}
          expandedId={expandedId}
          onToggle={toggle}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          toggleTag={toggleTag}
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
        <AddCardDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} categoryId={categoryId} addCard={addCard} addFlashCard={addFlashCard} />
        <BulkImportWrapper open={bulkImportOpen} onOpenChange={setBulkImportOpen} categoryId={categoryId} addFlashCard={addFlashCard} />
      </div>
    </div>
  );
}
