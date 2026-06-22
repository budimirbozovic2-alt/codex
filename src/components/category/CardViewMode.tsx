import { useState, useCallback, useMemo, useEffect } from "react";
import { Trash2, Tag, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Card } from "@/lib/spaced-repetition";
import type { FrequencyTag } from "@/lib/sr/types";
import type { CategoryRecord, SubcategoryNode } from "@/lib/db-types";
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
  addCard: (question: string, sections: { title: string; contentDoc: import("@/lib/editor-v4").EditorDoc }[], category: string, subcategory?: string, chapter?: string) => Card;
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

export default function CardViewMode({ cards, categoryId, allCategories, subcategoryNodes, patchCard, setFrequency, addCard: _addCard, addFlashCard: _addFlashCard, bulkAddFlashCards: _bulkAddFlashCards, onDelete, onEdit, onPassiveRead, masteryFilter, onClearMasteryFilter, externalQuery, initialSubcategory, initialChapter, initialType, initialFrequency, onFiltersChange }: Props) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveCardId, setMoveCardId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagPanelOpen, setTagPanelOpen] = useState(false);

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
    setTagPanelOpen(false);
    setTagInput("");
  }, []);

  const selectedTagsSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of selectedIds) {
      const c = cards.find(x => x.id === id);
      for (const t of c?.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [selectedIds, cards]);

  const handleBulkAddTag = useCallback((rawTag: string) => {
    const tag = rawTag.trim();
    if (!tag || selectedIds.size === 0) return;
    let added = 0;
    selectedIds.forEach(id => {
      patchCard(id, c => {
        const existing = c.tags ?? [];
        if (existing.includes(tag)) return c;
        added++;
        return { ...c, tags: [...existing, tag] };
      });
    });
    setTagInput("");
    toast.success(added === 0 ? `Tag „${tag}" već postoji na svim izabranima.` : `Dodan tag „${tag}" na ${added} kartica.`);
  }, [selectedIds, patchCard]);

  const handleBulkRemoveTag = useCallback((tag: string) => {
    if (selectedIds.size === 0) return;
    let removed = 0;
    selectedIds.forEach(id => {
      patchCard(id, c => {
        const existing = c.tags ?? [];
        if (!existing.includes(tag)) return c;
        removed++;
        return { ...c, tags: existing.filter(t => t !== tag) };
      });
    });
    toast.success(`Uklonjen tag „${tag}" sa ${removed} kartica.`);
  }, [selectedIds, patchCard]);

  const confirmMove = useCallback((targetCategoryId: string) => {
    if (!moveCardId) return;
    patchCard(moveCardId, c => ({ ...c, categoryId: targetCategoryId }));
    setMoveCardId(null);
  }, [moveCardId, patchCard]);

  const handleOpenMoveModal = useCallback((cardId: string) => {
    setMoveCardId(cardId);
    setMoveModalOpen(true);
  }, []);

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
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/50 p-2.5">
              <span className="text-xs font-medium text-foreground">{selectedIds.size} izabrano</span>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set(filters.filteredCards.map(c => c.id)))} className="h-7 gap-1.5 text-xs">
                Označi sve ({filters.filteredCards.length})
              </Button>
              {selectedIds.size > 0 && (
                <>
                  <span className="h-4 w-px bg-border" aria-hidden />
                  <span className="text-xs text-muted-foreground">Frekventnost:</span>
                  <Button variant="default" size="sm" onClick={() => handleBatchSetFrequency("često")} className="h-7 text-xs" aria-label="Označi kao često">
                    Često
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleBatchSetFrequency("rijetko")} className="h-7 text-xs" aria-label="Označi kao rijetko">
                    Rijetko
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleBatchSetFrequency("nikad")} className="h-7 text-xs" aria-label="Označi kao nikad">
                    Nikad
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleBatchSetFrequency(null)} className="h-7 text-xs" aria-label="Ukloni frekventnost">
                    Bez frekv.
                  </Button>
                  <span className="h-4 w-px bg-border" aria-hidden />
                  <Button
                    variant={tagPanelOpen ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTagPanelOpen(v => !v)}
                    className="h-7 gap-1.5 text-xs"
                    aria-expanded={tagPanelOpen}
                    aria-label="Tagovi"
                  >
                    <Tag className="h-3.5 w-3.5" /> Tagovi
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

            {tagPanelOpen && selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Oznake za izabrane
                </span>
                {selectedTagsSummary.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">Nema postojećih oznaka.</span>
                )}
                {selectedTagsSummary.map(({ tag, count }) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs">
                    {tag}
                    <span className="text-[9px] text-muted-foreground">({count}/{selectedIds.size})</span>
                    <button
                      onClick={() => handleBulkRemoveTag(tag)}
                      aria-label={`Ukloni ${tag} sa izabranih`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <span className="h-4 w-px bg-border ml-1" aria-hidden />
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBulkAddTag(tagInput);
                    }
                  }}
                  placeholder="Novi tag..."
                  className="h-7 px-2 rounded-md border bg-background text-xs w-32 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Novi tag"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleBulkAddTag(tagInput)}
                  disabled={!tagInput.trim()}
                >
                  <Plus className="h-3 w-3" /> Dodaj
                </Button>
              </div>
            )}
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
          onOpenMoveModal={handleOpenMoveModal}
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
