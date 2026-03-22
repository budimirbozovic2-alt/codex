import { Card, getCardScore, getSectionScore, getCardRetrievability, getRetrievability } from "@/lib/spaced-repetition";
import { format } from "date-fns";
import { Edit2, Trash2 } from "lucide-react";
import { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down";
import { default as ChevronRight } from "lucide-react/dist/esm/icons/chevron-right";
import { default as Zap } from "lucide-react/dist/esm/icons/zap";
import { default as Flame } from "lucide-react/dist/esm/icons/flame";
import { default as MoreVertical } from "lucide-react/dist/esm/icons/more-vertical";
import { default as FolderOpen } from "lucide-react/dist/esm/icons/folder-open";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as Tag } from "lucide-react/dist/esm/icons/tag";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Check } from "lucide-react/dist/esm/icons/check";
import TextSelectionTooltip from "@/components/TextSelectionTooltip";
import { default as GripVertical } from "lucide-react/dist/esm/icons/grip-vertical";
import { useState, useRef, useEffect, useMemo, useCallback, CSSProperties, memo } from "react";
import { List, type RowComponentProps } from "react-window";

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
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-success bg-success/10" : score >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${color}`}>{score}%</span>;
}

function RetentionBadge({ retention }: { retention: number }) {
  if (retention === 0) return null;
  const color = retention >= 90 ? "text-success" : retention >= 70 ? "text-warning" : "text-destructive";
  const strokeColor = retention >= 90 ? "hsl(var(--success))" : retention >= 70 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  const circumference = 2 * Math.PI * 7;
  const offset = circumference - (retention / 100) * circumference;
  return (
    <span className={`text-[11px] font-medium flex items-center gap-1 ${color}`} title={`Vjerovatnoća prisjećanja: ${retention}%`}>
      <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0">
        <circle cx="9" cy="9" r="7" fill="none" stroke="hsl(var(--muted))" strokeWidth="2" />
        <circle cx="9" cy="9" r="7" fill="none" stroke={strokeColor} strokeWidth="2"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 9 9)" className="transition-all duration-500" />
      </svg>
      {retention}%
    </span>
  );
}

function SectionBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : score > 0 ? "bg-destructive" : "bg-muted-foreground/30";
  return (
    <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(score, 5)}%` }} />
    </div>
  );
}

// ── Context Menu (⋯) ──────────────────────────────────────
function CardContextMenu({ card, categories, subcategories, availableChapters, onMoveCategory, onAssignChapter, onToggleTag, onCloneToMnemonic }: {
  card: Card;
  categories?: string[];
  subcategories?: Record<string, string[]>;
  availableChapters?: string[];
  onMoveCategory?: (cardId: string, category: string, subcategory?: string) => void;
  onAssignChapter?: (cardId: string, chapter: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  onCloneToMnemonic?: (card: Card) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"category" | "subcategory" | "chapter" | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSubmenu(null);
        setSelectedCat(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const cardTags = card.tags || [];
  const isFrequent = cardTags.includes("često-na-ispitu");
  const hasMnemoTag = cardTags.includes("mnemonic");

  const menuItems: { icon: typeof FolderOpen; label: string; action: () => void; active?: boolean; destructive?: boolean }[] = [];

  if (categories && categories.length > 0 && onMoveCategory) {
    menuItems.push({ icon: FolderOpen, label: "Premjesti u kategoriju", action: () => setSubmenu("category") });
  }
  if (availableChapters && availableChapters.length > 0 && onAssignChapter) {
    menuItems.push({ icon: BookOpen, label: "Dodijeli glavu", action: () => setSubmenu("chapter") });
  }
  menuItems.push({ icon: Flame, label: isFrequent ? "Ukloni 'Često na ispitu'" : "Označi 'Često na ispitu'", action: () => { onToggleTag(card.id, "često-na-ispitu"); setOpen(false); }, active: isFrequent });
  if (onCloneToMnemonic) {
    menuItems.push({ icon: Brain, label: hasMnemoTag ? "Već u Mnemo radionici" : "Kloniraj u Mnemo radionicu", action: () => { if (!hasMnemoTag) { onCloneToMnemonic(card); setOpen(false); } }, active: hasMnemoTag });
  }

  const subs = selectedCat ? (subcategories?.[selectedCat] || []) : [];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); setSubmenu(null); setSelectedCat(null); }}
        className="p-2 hover:bg-secondary rounded-lg transition-colors"
        title="Više opcija"
      >
        <MoreVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          {!submenu && (
            <div className="p-1">
              {menuItems.map(({ icon: Icon, label, action, active }) => (
                <button
                  key={label}
                  onClick={(e) => { e.stopPropagation(); action(); }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    active ? "text-primary bg-primary/5" : "text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                  {active && <Check className="h-3 w-3 ml-auto text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {submenu === "category" && (
            <div className="p-1 max-h-64 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Premjesti u kategoriju</p>
              {(categories || []).map(cat => (
                <button
                  key={cat}
                  onClick={(e) => {
                    e.stopPropagation();
                    const catSubs = subcategories?.[cat] || [];
                    if (catSubs.length > 0) {
                      setSelectedCat(cat);
                      setSubmenu("subcategory");
                    } else {
                      onMoveCategory!(card.id, cat);
                      setOpen(false);
                      setSubmenu(null);
                    }
                  }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    card.category === cat ? "text-primary bg-primary/5" : "hover:bg-secondary"
                  }`}
                >
                  <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{cat}</span>
                  {card.category === cat && <Check className="h-3 w-3 ml-auto text-primary flex-shrink-0" />}
                  {(subcategories?.[cat] || []).length > 0 && <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />}
                </button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); setSubmenu(null); }} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground text-left">← Nazad</button>
            </div>
          )}

          {submenu === "subcategory" && selectedCat && (
            <div className="p-1 max-h-64 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{selectedCat} ›</p>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveCategory!(card.id, selectedCat); setOpen(false); setSubmenu(null); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm hover:bg-secondary text-muted-foreground italic"
              >
                Bez podkategorije
              </button>
              {subs.map(sub => (
                <button
                  key={sub}
                  onClick={(e) => { e.stopPropagation(); onMoveCategory!(card.id, selectedCat, sub); setOpen(false); setSubmenu(null); }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    card.category === selectedCat && card.subcategory === sub ? "text-primary bg-primary/5" : "hover:bg-secondary"
                  }`}
                >
                  <span className="truncate">{sub}</span>
                  {card.category === selectedCat && card.subcategory === sub && <Check className="h-3 w-3 ml-auto text-primary flex-shrink-0" />}
                </button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); setSubmenu("category"); setSelectedCat(null); }} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground text-left">← Nazad</button>
            </div>
          )}

          {submenu === "chapter" && (
            <div className="p-1 max-h-64 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dodijeli glavu</p>
              {(availableChapters || []).map(ch => (
                <button
                  key={ch}
                  onClick={(e) => { e.stopPropagation(); onAssignChapter!(card.id, ch); setOpen(false); setSubmenu(null); }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    card.chapter === ch ? "text-primary bg-primary/5" : "hover:bg-secondary"
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{ch}</span>
                  {card.chapter === ch && <Check className="h-3 w-3 ml-auto text-primary flex-shrink-0" />}
                </button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); setSubmenu(null); }} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground text-left">← Nazad</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const COLLAPSED_ROW_HEIGHT = 100;
const EXPANDED_ROW_BASE = 160;
const SECTION_HEIGHT = 80;
const GAP = 12;
const VIRTUALIZATION_THRESHOLD = 50;

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
}

const CardRowInner = memo(function CardRowInner({ card, expanded, highlighted, selectionMode, selectedIds, onToggleSelect, onToggleTag, onExpand, onEdit, onDelete, categories, subcategories, availableChapters, onMoveCategory, onAssignChapter, onCloneToMnemonic }: CardRowProps) {
  const score = getCardScore(card);
  const retention = getCardRetrievability(card);
  const isFlash = card.type === "flash";
  const cardTags = card.tags || [];
  const isFrequent = cardTags.includes("često-na-ispitu");

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
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
              {card.subcategory ? (
                <span className="text-xs text-muted-foreground">› {card.subcategory}</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">Bez podkat.</span>
              )}
              {card.chapter && <span className="text-xs text-muted-foreground/70">› {card.chapter}</span>}
              <ScoreBadge score={score} />
              <RetentionBadge retention={retention} />
              {isFlash ? (
                <span className="text-xs text-primary flex items-center gap-1"><Zap className="h-3 w-3" /> Blic</span>
              ) : (
                <span className="text-xs text-muted-foreground">{card.sections.length} cjelina</span>
              )}
            </div>
            <p className="font-serif text-lg line-clamp-2">{card.question}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => onToggleTag(card.id, "često-na-ispitu")} className={`p-2 rounded-lg transition-colors ${isFrequent ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"}`} title={isFrequent ? "Često na ispitu (klikni da ukloniš)" : "Označi kao često na ispitu"}>
              <Flame className="h-4 w-4" />
            </button>
            <CardContextMenu
              card={card}
              categories={categories}
              subcategories={subcategories}
              availableChapters={availableChapters}
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

      {expanded && (
        <TextSelectionTooltip cardId={card.id} question={card.question} category={card.category} subcategory={card.subcategory} tags={card.tags}>
        <div className="px-5 pb-5 space-y-3 border-t pt-4 max-h-[60vh] overflow-y-auto">
          {isFlash ? (
            <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: card.sections[0]?.content || "" }} />
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
                  <div className="text-sm text-muted-foreground line-clamp-2" dangerouslySetInnerHTML={{ __html: s.content }} />
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
}

function VirtualRow(props: RowComponentProps<VirtualRowData>) {
  const { index, style, filteredCards, expandedId, scrollToCardId, selectionMode, selectedIds, onToggleSelect, onToggleTag, onExpand, onEdit, onDelete, categories, subcategories, availableChapters, onMoveCategory, onAssignChapter, onCloneToMnemonic } = props;
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
  onMoveCategory, onAssignChapter, onCloneToMnemonic, availableChapters,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<{ scrollToRow: (config: { index: number; align?: string }) => void } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let result = filterCategory ? cards.filter(c => c.category === filterCategory) : cards;
    if (filterSubcategory === "__none__") result = result.filter(c => !c.subcategory);
    else if (filterSubcategory) result = result.filter(c => c.subcategory === filterSubcategory);
    if (filterChapter) result = result.filter(c => c.chapter === filterChapter);
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
        listRef={listRef as any}
        rowProps={{
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
        }}
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
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
