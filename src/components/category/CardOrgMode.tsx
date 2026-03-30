import { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, pointerWithin, DragOverlay, MeasuringStrategy,
  useDroppable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, FolderOpen, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Card } from "@/lib/spaced-repetition";
import { type SubcategoryNode } from "@/lib/db";
import { cn } from "@/lib/utils";

interface Props {
  cards: Card[];
  categoryId: string;
  subcategoryNodes: SubcategoryNode[];
  patchCard: (id: string, fn: (c: Card) => Card) => void;
}

interface TreeNode {
  subcategory: string;
  chapters: { chapter: string; cards: Card[] }[];
  unassigned: Card[];
}

/** Encode a droppable chapter zone ID */
const chapterDropId = (sub: string, chapter: string) => `__drop__${sub}__${chapter}`;
const parseChapterDropId = (id: string) => {
  if (!id.startsWith("__drop__")) return null;
  const rest = id.slice("__drop__".length);
  const sepIdx = rest.indexOf("__");
  if (sepIdx < 0) return null;
  return { subcategory: rest.slice(0, sepIdx), chapter: rest.slice(sepIdx + 2) };
};

function buildTree(cards: Card[], subcategoryNodes: SubcategoryNode[]): TreeNode[] {
  // Start with structure from SubcategoryNode[]
  const nodeMap = new Map<string, { chapters: Map<string, Card[]>; unassigned: Card[] }>();

  // Initialize from canonical structure
  for (const node of subcategoryNodes) {
    const chMap = new Map<string, Card[]>();
    for (const ch of node.chapters) chMap.set(ch, []);
    nodeMap.set(node.name, { chapters: chMap, unassigned: [] });
  }

  // Ensure "(Bez potkategorije)" exists for unassigned cards
  if (!nodeMap.has("(Bez potkategorije)")) {
    nodeMap.set("(Bez potkategorije)", { chapters: new Map(), unassigned: [] });
  }

  // Assign cards to the tree
  for (const card of cards) {
    const sub = card.subcategory || "(Bez potkategorije)";
    if (!nodeMap.has(sub)) {
      nodeMap.set(sub, { chapters: new Map(), unassigned: [] });
    }
    const entry = nodeMap.get(sub)!;
    if (card.chapter && entry.chapters.has(card.chapter)) {
      entry.chapters.get(card.chapter)!.push(card);
    } else if (card.chapter) {
      // Chapter exists on card but not in canonical tree — create it dynamically
      if (!entry.chapters.has(card.chapter)) entry.chapters.set(card.chapter, []);
      entry.chapters.get(card.chapter)!.push(card);
    } else {
      entry.unassigned.push(card);
    }
  }

  const result: TreeNode[] = [];
  for (const [sub, entry] of nodeMap) {
    const chapters = Array.from(entry.chapters.entries())
      .map(([chapter, cards]) => ({
        chapter,
        cards: cards.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }));
    // Only include if has content OR is a canonical node
    const totalCards = chapters.reduce((sum, ch) => sum + ch.cards.length, 0) + entry.unassigned.length;
    const isCanonical = subcategoryNodes.some(n => n.name === sub);
    if (totalCards > 0 || isCanonical) {
      result.push({ subcategory: sub, chapters, unassigned: entry.unassigned });
    }
  }

  // Sort: canonical nodes by sortOrder, then dynamic ones alphabetically
  const sortOrderMap = new Map(subcategoryNodes.map(n => [n.name, n.sortOrder]));
  return result.sort((a, b) => {
    const aOrder = sortOrderMap.get(a.subcategory) ?? 999;
    const bOrder = sortOrderMap.get(b.subcategory) ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.subcategory.localeCompare(b.subcategory);
  });
}

// ─── Sortable card tile ─────────────────────────────────
function SortableCardTile({ card, index }: { card: Card; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded border bg-background px-3 py-1.5 group">
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">{index + 1}.</span>
      <span className="text-xs text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
    </div>
  );
}

// ─── Droppable chapter zone ─────────────────────────────
function DroppableChapterHeader({ sub, chapter, count }: { sub: string; chapter: string; count: number }) {
  const dropId = chapterDropId(sub, chapter);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 py-1.5 rounded transition-colors",
        isOver && "bg-primary/10 text-primary ring-1 ring-primary/30"
      )}
    >
      {chapter}
      <Badge variant="secondary" className="ml-2 text-[9px] h-4 px-1">{count}</Badge>
    </div>
  );
}

// ─── Drag overlay (ghost) ───────────────────────────────
function CardDragOverlay({ card }: { card: Card }) {
  return (
    <div className="flex items-center gap-2 rounded border bg-card shadow-xl px-3 py-1.5 w-80 pointer-events-none">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
    </div>
  );
}

// ─── Main component (assignment only — no CRUD) ─────────
export default function CardOrgMode({ cards, categoryId, subcategoryNodes, patchCard }: Props) {
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(cards, subcategoryNodes), [cards, subcategoryNodes]);
  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  /** Find which sub+chapter a card belongs to */
  const findCardContainer = useCallback((cardId: string): { sub: string; chapter: string } | null => {
    for (const node of tree) {
      for (const ch of node.chapters) {
        if (ch.cards.some(c => c.id === cardId)) {
          return { sub: node.subcategory, chapter: ch.chapter };
        }
      }
    }
    return null;
  }, [tree]);

  const toggleSub = useCallback((sub: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub); else next.add(sub);
      return next;
    });
  }, []);

  const assignChapter = useCallback((cardId: string, chapter: string) => {
    patchCard(cardId, c => ({ ...c, chapter: chapter || undefined }));
  }, [patchCard]);

  // ─── DnD handlers ─────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCardId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a chapter header zone
    const dropTarget = parseChapterDropId(overId);
    if (dropTarget) {
      const targetSub = dropTarget.subcategory === "(Bez potkategorije)" ? "" : dropTarget.subcategory;
      patchCard(activeCardId, c => ({
        ...c,
        chapter: dropTarget.chapter,
        subcategory: targetSub,
        sortOrder: 9999,
      }));
      return;
    }

    // Dropped on another card
    const overCard = cardMap.get(overId);
    if (!overCard) return;

    const activeContainer = findCardContainer(activeCardId);
    const overContainer = findCardContainer(overId);
    if (!activeContainer || !overContainer) return;

    const sameContainer = activeContainer.sub === overContainer.sub && activeContainer.chapter === overContainer.chapter;

    if (sameContainer) {
      const chapterNode = tree
        .find(n => n.subcategory === overContainer.sub)
        ?.chapters.find(ch => ch.chapter === overContainer.chapter);
      if (!chapterNode) return;

      const oldIndex = chapterNode.cards.findIndex(c => c.id === activeCardId);
      const newIndex = chapterNode.cards.findIndex(c => c.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(chapterNode.cards, oldIndex, newIndex);
      reordered.forEach((c, i) => {
        patchCard(c.id, card => ({ ...card, sortOrder: i }));
      });
    } else {
      const targetSub = overContainer.sub === "(Bez potkategorije)" ? "" : overContainer.sub;
      const targetChapterNode = tree
        .find(n => n.subcategory === overContainer.sub)
        ?.chapters.find(ch => ch.chapter === overContainer.chapter);
      if (!targetChapterNode) return;

      const overIdx = targetChapterNode.cards.findIndex(c => c.id === overId);
      const newList = targetChapterNode.cards.filter(c => c.id !== activeCardId);
      newList.splice(overIdx, 0, cardMap.get(activeCardId)!);

      patchCard(activeCardId, c => ({
        ...c,
        chapter: overContainer.chapter,
        subcategory: targetSub,
      }));

      newList.forEach((c, i) => {
        patchCard(c.id, card => ({ ...card, sortOrder: i }));
      });
    }
  }, [cardMap, tree, patchCard, findCardContainer]);

  const activeCard = activeId ? cardMap.get(activeId) : null;

  if (cards.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        Nema kartica za organizaciju.
      </div>
    );
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <div className="space-y-3">
        {tree.map(node => {
          const isExpanded = expandedSubs.has(node.subcategory);
          const totalCards = node.chapters.reduce((sum, ch) => sum + ch.cards.length, 0) + node.unassigned.length;

          return (
            <div key={node.subcategory} className="rounded-lg border bg-card overflow-hidden">
              {/* Subcategory header — read-only */}
              <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-accent/30 transition-colors">
                <button onClick={() => toggleSub(node.subcategory)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <FolderOpen className="h-4 w-4 text-primary/70" />
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{node.subcategory}</span>
                </button>
                <Badge variant="secondary" className="text-[10px]">{totalCards}</Badge>
              </div>

              {isExpanded && (
                <div className="border-t px-3 py-2 space-y-2">
                  {/* Chapters with DnD */}
                  {node.chapters.map(ch => (
                    <div key={ch.chapter} className="space-y-1">
                      <DroppableChapterHeader sub={node.subcategory} chapter={ch.chapter} count={ch.cards.length} />
                      <SortableContext items={ch.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {ch.cards.map((card, idx) => (
                          <SortableCardTile key={card.id} card={card} index={idx} />
                        ))}
                      </SortableContext>
                    </div>
                  ))}

                  {/* Unassigned cards — draggable */}
                  {node.unassigned.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground italic px-1 py-1">Bez glave</div>
                      <SortableContext items={node.unassigned.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {node.unassigned.map((card, idx) => {
                          const availableChapters = node.chapters.map(ch => ch.chapter);
                          return (
                            <div key={card.id} className="flex items-center gap-2">
                              <SortableCardTile card={card} index={idx} />
                              <div className="flex items-center gap-1 shrink-0">
                                {availableChapters.length > 0 && (
                                  <Select onValueChange={v => assignChapter(card.id, v)}>
                                    <SelectTrigger className="h-6 w-28 text-[10px]">
                                      <SelectValue placeholder="Dodijeli glavu" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableChapters.map(ch => (
                                        <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                                {tree.length > 1 && (
                                  <Select onValueChange={v => {
                                    const targetSub = v === "(Bez potkategorije)" ? "" : v;
                                    patchCard(card.id, c => ({ ...c, subcategory: targetSub }));
                                  }}>
                                    <SelectTrigger className="h-6 w-28 text-[10px]">
                                      <SelectValue placeholder="Premjesti →" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {tree.filter(n => n.subcategory !== node.subcategory).map(n => (
                                        <SelectItem key={n.subcategory} value={n.subcategory} className="text-xs">{n.subcategory}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </SortableContext>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Drag overlay — rendered via portal to avoid layout offset */}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {activeCard ? <CardDragOverlay card={activeCard} /> : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
