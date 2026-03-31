import { Edit2, Trash2, Scale, ChevronDown, ChevronRight, Zap, Flame, GripVertical } from "lucide-react";
import { Card, getCardScore, getSectionScore, getCardRetrievability, getRetrievability } from "@/lib/spaced-repetition";
import { highlightKeyParts } from "@/lib/highlight-key-parts";
import { format } from "date-fns";
import TextSelectionTooltip from "@/components/TextSelectionTooltip";
import { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense, CSSProperties, memo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type CategoryRecord } from "@/lib/db";
import { List, type RowComponentProps } from "react-window";
import { ScoreBadge, RetentionBadge, SectionBar } from "./card-list/CardBadges";
import CardContextMenu from "./card-list/CardContextMenu";
import { getCategoryName, getSubcategoryName, getChapterName } from "@/lib/category-service";

const SourceSnippetDialog = lazy(() => import("@/components/SourceSnippetDialog"));

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
  // Context menu support
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

interface CardRowProps {
  card: Card;
  expanded: boolean;
  highlighted: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  onExpand: (id: string | null) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  // Context menu
  categories?: string[];
  subcategories?: Record<string, string[]>;
  availableChapters?: string[];
  onMoveCategory?: (cardId: string, category: string, subcategory?: string) => void;
  onAssignChapter?: (cardId: string, chapter: string) => void;
  onCloneToMnemonic?: (card: Card) => void;
  onAddKeyPart?: (cardId: string, text: string) => void;
  categoryRecords?: CategoryRecord[];
}

const CardRowInner = memo(function CardRowInner({
  card,
  expanded,
  highlighted,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onToggleTag,
  onExpand,
  onEdit,
  onDelete,
  categories,
  subcategories,
  availableChapters,
  onMoveCategory,
  onAssignChapter,
  onCloneToMnemonic,
  onAddKeyPart,
  categoryRecords,
}: CardRowProps) {
  const score = getCardScore(card);
  const retention = getCardRetrievability(card);
  const isFlash = card.type === "flash";
  const cardTags = card.tags || [];
  const isFrequent = cardTags.includes("često-na-ispitu");
  const hasSource = !!card.sourceId && !!card.originalSourceSnippet;
  const [snippetOpen, setSnippetOpen] = useState(false);

  return (
    <div
      className={`rounded-xl bg-card border hover:border-primary/30 transition-colors overflow-hidden ${highlighted ? "ring-2 ring-primary/50" : ""}`}
      data-card-id={card.id}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {selectionMode && (
            <button
              onClick={() => onToggleSelect?.(card.id)}
              className={`mt-1 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                selectedIds?.has(card.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"
              }`}
            >
              {selectedIds?.has(card.id) && <span className="text-xs">✓</span>}
            </button>
          )}
            <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {getCategoryName(categoryRecords ?? [], card.categoryId) || card.categoryId}
              </span>
              {card.subcategoryId ? (
                <span className="text-xs text-muted-foreground">
                  › {getSubcategoryName(categoryRecords ?? [], card.subcategoryId) || card.subcategoryId}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">Bez podkat.</span>
              )}
              {card.chapterId && (
                <span className="text-xs text-muted-foreground/70">
                  › {getChapterName(categoryRecords ?? [], card.chapterId) || card.chapterId}
                </span>
              )}
              <ScoreBadge score={score} />
              <RetentionBadge retention={retention} />
              {isFlash ? (
                <span className="text-xs text-primary flex items-center gap-1"><Zap className="h-3 w-3" /> Blic</span>
              ) : (
                <span className="text-xs text-muted-foreground">{card.sections.length} cjelina</span>
              )}
            </div>
            <p className="text-lg font-medium line-clamp-2">{card.question}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {hasSource && (
              <button
                onClick={() => setSnippetOpen(true)}
                className={`p-2 rounded-lg transition-colors ${card.needsReview ? "text-warning bg-warning/10 hover:bg-warning/20" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"}`}
                title={card.needsReview ? "Izvor ažuriran — klikni za poređenje" : "Pogledaj originalni tekst izvora"}
              >
                <Scale className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => onToggleTag(card.id, "često-na-ispitu")} className={`p-2 rounded-lg transition-colors ${isFrequent ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"}`} title={isFrequent ? "Često na ispitu (klikni da ukloniš)" : "Označi kao često na ispitu"}>
              <Flame className="h-4 w-4" />
            </button>
            <CardContextMenu
              card={card}
              categories={categories}
              subcategories={subcategories}
              availableChapters={availableChapters}
              categoryRecords={categoryRecords}
              onMoveCategory={onMoveCategory}
              onAssignChapter={onAssignChapter}
              onToggleTag={onToggleTag}
              onCloneToMnemonic={onCloneToMnemonic}
            />
            <button onClick={() => onExpand(expanded ? null : card.id)} className="p-2 hover:bg-secondary rounded-lg">
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            <button onClick={() => onEdit(card)} className="p-2 hover:bg-secondary rounded-lg">
              <Edit2 className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => onDelete(card.id)} className="p-2 hover:bg-destructive/10 rounded-lg">
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
        </div>
      </div>

      {hasSource && snippetOpen && (
        <Suspense fallback={null}>
          <SourceSnippetDialog card={card} open={snippetOpen} onOpenChange={setSnippetOpen} />
        </Suspense>
      )}

      {expanded && (
        <TextSelectionTooltip
          cardId={card.id}
          question={card.question}
          category={card.categoryId}
          subcategory={card.subcategoryId}
          tags={card.tags}
          keyParts={card.keyParts}
          onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(card.id, text) : undefined}
        >
        <div className="px-5 pb-5 space-y-3 border-t pt-4 max-h-[60vh] overflow-y-auto">
          {isFlash ? (
            <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: highlightKeyParts(card.sections[0]?.content || "", card.keyParts) }} />
          ) : (
            card.sections.map(s => {
              const sScore = getSectionScore(s);
              const sRetention = getRetrievability(s);
              return (
                <div key={s.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.title}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ScoreBadge score={sScore} />
                      <RetentionBadge retention={sRetention} />
                      <span>S: {s.stability?.toFixed(1) ?? 0}d</span>
                      <span>Sljedeće: {format(new Date(s.nextReview), "dd.MM")}</span>
                    </div>
                  </div>
                  <SectionBar score={sScore} />
                  <div className="text-sm text-muted-foreground line-clamp-2" dangerouslySetInnerHTML={{ __html: highlightKeyParts(s.content, card.keyParts) }} />
                </div>
              );
            })
          )}
        </div>
        </TextSelectionTooltip>
      )}
    </div>
  );
});

// Props passed via rowProps to every virtual row
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
  categoryRecords?: CategoryRecord[];
}

function VirtualRow(props: RowComponentProps<VirtualRowData>) {
  const {
    index,
    style,
    filteredCards,
    expandedId,
    scrollToCardId,
    selectionMode,
    selectedIds,
    onToggleSelect,
    onToggleTag,
    onExpand,
    onEdit,
    onDelete,
    categories,
    subcategories,
    availableChapters,
    onMoveCategory,
    onAssignChapter,
    onCloneToMnemonic,
    onAddKeyPart,
    categoryRecords,
  } = props;
  const card = filteredCards[index];
  if (!card) return null;

  return (
    <div style={{ ...style, paddingBottom: GAP }}>
      <CardRowInner
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
        categoryRecords={categoryRecords}
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
  const allCats = useLiveQuery(() => db.categories.toArray(), []);

  const filtered = useMemo(() => {
    let result = filterCategory ? cards.filter(c => c.categoryId === filterCategory) : cards;
    if (filterSubcategory === "__none__") result = result.filter(c => !(c.subcategoryId || c.subcategory));
    else if (filterSubcategory) result = result.filter(c => (c.subcategoryId || c.subcategory) === filterSubcategory);
    if (filterChapter) result = result.filter(c => (c.chapterId || c.chapter) === filterChapter);
    if (filterType !== "all") result = result.filter(c => (c.type || "essay") === filterType);
    if (filterTag) result = result.filter(c => (c.tags || []).includes(filterTag));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => {
        const questionMatch = c.question.toLowerCase().includes(q);
        const contentMatch = c.sections.some(s => {
          const plain = s.content.replace(/<[^>]*>/g, "").toLowerCase();
          return plain.includes(q) || s.title.toLowerCase().includes(q);
        });
        return questionMatch || contentMatch;
      });
    }
    // Sort by sortOrder if available, then createdAt
    result = [...result].sort((a, b) => {
      const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.createdAt - b.createdAt;
    });
    return result;
  }, [cards, filterCategory, filterSubcategory, filterChapter, filterType, filterTag, searchQuery]);

  // Scroll-to-card for both modes
  useEffect(() => {
    if (!scrollToCardId) return;
    const idx = filtered.findIndex(c => c.id === scrollToCardId);
    if (idx >= 0 && listRef.current) {
      listRef.current.scrollToRow({ index: idx, align: "center" });
    }
    onScrolledTo?.();
  }, [scrollToCardId, filtered, onScrolledTo]);

  // Dynamic row height based on expanded state
  const getRowHeight = useCallback((index: number) => {
    const card = filtered[index];
    if (!card || expandedId !== card.id) return COLLAPSED_ROW_HEIGHT + GAP;
    const sectionCount = card.type === "flash" ? 1 : card.sections.length;
    return EXPANDED_ROW_BASE + sectionCount * SECTION_HEIGHT + GAP;
  }, [filtered, expandedId]);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

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

  // Auto-scroll when dragging near viewport edges
  const scrollRafRef = useRef<number | null>(null);
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    if (dragIndex === null) return;
    e.preventDefault();
    const EDGE_ZONE = 80; // px from edge to trigger scroll
    const SCROLL_SPEED = 12;
    const y = e.clientY;
    const vh = window.innerHeight;

    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);

    if (y < EDGE_ZONE) {
      const intensity = 1 - y / EDGE_ZONE;
      scrollRafRef.current = requestAnimationFrame(() => {
        window.scrollBy(0, -SCROLL_SPEED * intensity);
      });
    } else if (y > vh - EDGE_ZONE) {
      const intensity = 1 - (vh - y) / EDGE_ZONE;
      scrollRafRef.current = requestAnimationFrame(() => {
        window.scrollBy(0, SCROLL_SPEED * intensity);
      });
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
    categoryRecords: allCats,
  }), [filtered, expandedId, scrollToCardId, selectionMode, selectedIds, onToggleSelect, onToggleTag, onEdit, onDelete, propCategories, propSubcategories, availableChapters, onMoveCategory, onAssignChapter, onCloneToMnemonic, onAddKeyPart, allCats]);

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
              <CardRowInner
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
                categoryRecords={allCats}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
