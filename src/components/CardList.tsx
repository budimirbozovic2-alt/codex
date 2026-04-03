import { GripVertical } from "lucide-react";
import { Card } from "@/lib/spaced-repetition";
import { useState, useRef, useEffect, useMemo, useCallback, CSSProperties } from "react";
import { useCategoryData } from "@/contexts/AppContext";
import { List, type RowComponentProps } from "react-window";
import CardRow, { type CardRowProps } from "./card-list/CardRow";
import { useCardListFilters } from "@/hooks/useCardListFilters";

interface Props {
  cards: Card[];
  filterCategory: string | null;
  filterSubcategory?: string | null;
  filterChapter?: string | null;
  filterType?: "all" | "essay" | "flash";
  filterTag?: string | null;
  searchQuery?: string;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  scrollToCardId?: string | null;
  onScrolledTo?: () => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  reorderMode?: boolean;
  onReorder?: (orderedIds: string[]) => void;
  categories?: string[];
  subcategories?: Record<string, string[]>;
  onMoveCategory?: (cardId: string, category: string, subcategory?: string) => void;
  onAssignChapter?: (cardId: string, chapter: string) => void;
  onCloneToMnemonic?: (card: Card) => void;
  availableChapters?: string[];
  onAddKeyPart?: (cardId: string, text: string) => void;
}

const COLLAPSED_ROW_HEIGHT = 100;
const EXPANDED_ROW_BASE = 160;
const SECTION_HEIGHT = 80;
const GAP = 12;
const VIRTUALIZATION_THRESHOLD = 30;

interface VirtualRowData {
  filteredCards: Card[];
  expandedId: string | null;
  scrollToCardId?: string | null;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  onExpand: (id: string | null) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  categories?: string[];
  subcategories?: Record<string, string[]>;
  availableChapters?: string[];
  onMoveCategory?: (cardId: string, category: string, subcategory?: string) => void;
  onAssignChapter?: (cardId: string, chapter: string) => void;
  onCloneToMnemonic?: (card: Card) => void;
  onAddKeyPart?: (cardId: string, text: string) => void;
  catNameMap?: Record<string, string>;
}

function VirtualRow(props: RowComponentProps<VirtualRowData>) {
  const { index, style, filteredCards, expandedId, scrollToCardId, selectionMode, selectedIds, onToggleSelect, onToggleTag, onExpand, onEdit, onDelete, categories, subcategories, availableChapters, onMoveCategory, onAssignChapter, onCloneToMnemonic, onAddKeyPart, catNameMap } = props;
  const card = filteredCards[index];
  if (!card) return null;

  return (
    <div style={{ ...style, paddingBottom: GAP }}>
      <CardRow
        card={card}
        expanded={expandedId === card.id}
        highlighted={scrollToCardId === card.id}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        onToggleTag={onToggleTag}
        onExpand={onExpand}
        onEdit={onEdit}
        onDelete={onDelete}
        categories={categories}
        subcategories={subcategories}
        availableChapters={availableChapters}
        onMoveCategory={onMoveCategory}
        onAssignChapter={onAssignChapter}
        onCloneToMnemonic={onCloneToMnemonic}
        onAddKeyPart={onAddKeyPart}
        catNameMap={catNameMap}
      />
    </div>
  );
}

export default function CardList({
  cards, filterCategory, filterSubcategory, filterChapter, filterType = "all", filterTag, searchQuery = "",
  onEdit, onDelete, onToggleTag, scrollToCardId, onScrolledTo,
  selectionMode, selectedIds, onToggleSelect,
  reorderMode, onReorder,
  categories: propCategories, subcategories: propSubcategories,
  onMoveCategory, onAssignChapter, onCloneToMnemonic, availableChapters, onAddKeyPart,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<any>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { categoryRecords: allCats } = useCategoryData();

  const catNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of allCats) {
      m[r.id] = r.name;
      for (const sub of r.subcategories ?? []) m[sub.id] = sub.name;
      for (const sub of r.subcategories ?? []) for (const ch of sub.chapters ?? []) m["__ch_" + ch.id] = ch.name;
      for (const sub of r.subcategories ?? []) m["__sub_" + sub.id] = sub.name;
    }
    return m;
  }, [allCats]);

  const filtered = useCardListFilters(cards, { filterCategory, filterSubcategory, filterChapter, filterType, filterTag, searchQuery });

  useEffect(() => {
    if (!scrollToCardId) return;
    const idx = filtered.findIndex(c => c.id === scrollToCardId);
    if (idx >= 0 && listRef.current) {
      listRef.current.scrollToRow({ index: idx, align: "center" });
    }
    onScrolledTo?.();
  }, [scrollToCardId, filtered, onScrolledTo]);

  const getRowHeight = useCallback((index: number) => {
    const card = filtered[index];
    if (!card || expandedId !== card.id) return COLLAPSED_ROW_HEIGHT + GAP;
    const sectionCount = card.type === "flash" ? 1 : card.sections.length;
    return EXPANDED_ROW_BASE + sectionCount * SECTION_HEIGHT + GAP;
  }, [filtered, expandedId]);

  const handleDragStart = useCallback((index: number) => { setDragIndex(index); }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...filtered];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    onReorder?.(reordered.map(c => c.id));
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, filtered, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const scrollRafRef = useRef<number | null>(null);
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    if (dragIndex === null) return;
    e.preventDefault();
    const EDGE_ZONE = 80;
    const SCROLL_SPEED = 12;
    const y = e.clientY;
    const vh = window.innerHeight;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    if (y < EDGE_ZONE) {
      const intensity = 1 - y / EDGE_ZONE;
      scrollRafRef.current = requestAnimationFrame(() => { window.scrollBy(0, -SCROLL_SPEED * intensity); });
    } else if (y > vh - EDGE_ZONE) {
      const intensity = 1 - (vh - y) / EDGE_ZONE;
      scrollRafRef.current = requestAnimationFrame(() => { window.scrollBy(0, SCROLL_SPEED * intensity); });
    }
  }, [dragIndex]);

  const useVirtualization = filtered.length >= VIRTUALIZATION_THRESHOLD && !reorderMode;

  const virtualRowProps = useMemo(() => ({
    filteredCards: filtered,
    expandedId,
    scrollToCardId,
    selectionMode,
    selectedIds,
    onToggleSelect,
    onToggleTag,
    onExpand: setExpandedId,
    onEdit,
    onDelete,
    categories: propCategories,
    subcategories: propSubcategories,
    availableChapters,
    onMoveCategory,
    onAssignChapter,
    onCloneToMnemonic,
    onAddKeyPart,
    catNameMap,
  }), [filtered, expandedId, scrollToCardId, selectionMode, selectedIds, onToggleSelect, onToggleTag, onEdit, onDelete, propCategories, propSubcategories, availableChapters, onMoveCategory, onAssignChapter, onCloneToMnemonic, onAddKeyPart, catNameMap]);

  if (filtered.length === 0) {
    return <p className="text-muted-foreground text-center py-12">Nema kartica. Kreirajte prvu!</p>;
  }

  if (useVirtualization) {
    return (
      <List
        defaultHeight={700}
        rowCount={filtered.length}
        rowHeight={getRowHeight}
        overscanCount={8}
        rowComponent={VirtualRow}
        listRef={listRef}
        rowProps={virtualRowProps}
        style={{ height: Math.min(filtered.length * (COLLAPSED_ROW_HEIGHT + GAP), 700) }}
      />
    );
  }

  return (
    <div className="space-y-3" onDragOver={reorderMode ? handleContainerDragOver : undefined}>
      {filtered.map((card, index) => (
        <div
          key={card.id}
          draggable={reorderMode}
          onDragStart={reorderMode ? () => handleDragStart(index) : undefined}
          onDragOver={reorderMode ? (e) => handleDragOver(e, index) : undefined}
          onDrop={reorderMode ? () => handleDrop(index) : undefined}
          onDragEnd={reorderMode ? handleDragEnd : undefined}
          className={`transition-all ${reorderMode ? "cursor-grab active:cursor-grabbing" : ""} ${
            dragOverIndex === index && dragIndex !== index ? "border-t-2 border-primary" : ""
          } ${dragIndex === index ? "opacity-40" : ""}`}
        >
          <div className="flex items-stretch gap-0">
            {reorderMode && (
              <div className="flex items-center pr-2 text-muted-foreground/50 hover:text-muted-foreground">
                <GripVertical className="h-5 w-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <CardRow
                card={card}
                expanded={expandedId === card.id}
                highlighted={scrollToCardId === card.id}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onToggleTag={onToggleTag}
                onExpand={setExpandedId}
                onEdit={onEdit}
                onDelete={onDelete}
                categories={propCategories}
                subcategories={propSubcategories}
                availableChapters={availableChapters}
                onMoveCategory={onMoveCategory}
                onAssignChapter={onAssignChapter}
                onCloneToMnemonic={onCloneToMnemonic}
                onAddKeyPart={onAddKeyPart}
                catNameMap={catNameMap}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
