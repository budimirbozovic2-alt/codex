import { useState, useCallback, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, pointerWithin, DragOverlay, MeasuringStrategy,
  useDroppable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, FolderOpen, GripVertical, BookOpen, Inbox } from "lucide-react";
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

const chapterDropId = (sub: string, chapter: string) => `__drop__${sub}__${chapter}`;
const parseChapterDropId = (id: string) => {
  if (!id.startsWith("__drop__")) return null;
  const rest = id.slice("__drop__".length);
  const sepIdx = rest.indexOf("__");
  if (sepIdx < 0) return null;
  return { subcategory: rest.slice(0, sepIdx), chapter: rest.slice(sepIdx + 2) };
};

function buildTree(cards: Card[], subcategoryNodes: SubcategoryNode[]): TreeNode[] {
  const nodeMap = new Map<string, { chapters: Map<string, Card[]>; unassigned: Card[] }>();

  for (const node of subcategoryNodes) {
    const chMap = new Map<string, Card[]>();
    for (const ch of node.chapters) chMap.set(typeof ch === "string" ? ch : ch.id, []);
    nodeMap.set(node.id, { chapters: chMap, unassigned: [] });
  }

  const UNCAT_KEY = "(Bez potkategorije)";
  if (!nodeMap.has(UNCAT_KEY)) {
    nodeMap.set(UNCAT_KEY, { chapters: new Map(), unassigned: [] });
  }

  for (const card of cards) {
    const sub = card.subcategoryId || UNCAT_KEY;
    if (!nodeMap.has(sub)) {
      nodeMap.set(sub, { chapters: new Map(), unassigned: [] });
    }
    const entry = nodeMap.get(sub)!;
    const cardChap = card.chapterId;
    if (cardChap && entry.chapters.has(cardChap)) {
      entry.chapters.get(cardChap)!.push(card);
    } else if (cardChap) {
      if (!entry.chapters.has(cardChap)) entry.chapters.set(cardChap, []);
      entry.chapters.get(cardChap)!.push(card);
    } else {
      entry.unassigned.push(card);
    }
  }

  // Build name lookup for subcategory nodes
  const subNameMap = new Map(subcategoryNodes.map(n => [n.id, n.name]));
  // Build name lookup for chapter nodes
  const chapNameMap = new Map<string, string>();
  for (const node of subcategoryNodes) {
    for (const ch of node.chapters) {
      if (typeof ch !== "string") chapNameMap.set(ch.id, ch.name);
    }
  }

  const result: TreeNode[] = [];
  for (const [sub, entry] of nodeMap) {
    const chapters = Array.from(entry.chapters.entries())
      .map(([chapter, cards]) => ({
        chapter: chapNameMap.get(chapter) || chapter,
        cards: cards.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }));
    const totalCards = chapters.reduce((sum, ch) => sum + ch.cards.length, 0) + entry.unassigned.length;
    const isCanonical = subcategoryNodes.some(n => n.id === sub);
    const displayName = subNameMap.get(sub) || sub;
    if (totalCards > 0 || isCanonical) {
      result.push({ subcategory: displayName, chapters, unassigned: entry.unassigned });
    }
  }

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
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 group hover:border-primary/30 hover:shadow-sm transition-all"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground opacity-40 group-hover:opacity-80 transition-opacity shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums w-6 text-right shrink-0">{index + 1}.</span>
      <span className="text-sm text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
      <Badge variant="outline" className="text-[9px] shrink-0 opacity-60">
        {card.type === "flash" ? "Blic" : "Esej"}
      </Badge>
    </div>
  );
}

// ─── Droppable chapter zone ─────────────────────────────
function DroppableChapterZone({ sub, chapter, count, children }: {
  sub: string; chapter: string; count: number; children: React.ReactNode;
}) {
  const dropId = chapterDropId(sub, chapter);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border border-dashed p-3 space-y-2 transition-all",
        isOver
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border/60 bg-muted/20"
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <BookOpen className="h-3.5 w-3.5 text-primary/60" />
        <span className="text-xs font-semibold text-foreground/80">{chapter}</span>
        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-auto">{count}</Badge>
      </div>
      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  );
}

// ─── Drag overlay (ghost) ───────────────────────────────
function CardDragOverlay({ card }: { card: Card }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-primary/40 bg-card shadow-2xl px-4 py-2.5 w-80 pointer-events-none">
      <GripVertical className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
    </div>
  );
}

// ─── Unassigned card with assign controls ───────────────
function UnassignedCardRow({
  card, index, availableChapters, otherSubs, onAssignChapter, onMoveSub,
}: {
  card: Card; index: number;
  availableChapters: string[]; otherSubs: string[];
  onAssignChapter: (v: string) => void;
  onMoveSub: (v: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 group">
      <div className="flex-1 flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 hover:border-orange-500/40 transition-all">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground opacity-40 group-hover:opacity-80 transition-opacity shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums w-6 text-right shrink-0">{index + 1}.</span>
        <span className="text-sm text-foreground truncate flex-1">{card.question || "(Bez pitanja)"}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {availableChapters.length > 0 && (
          <Select onValueChange={onAssignChapter}>
            <SelectTrigger className="h-7 w-32 text-[10px] border-dashed">
              <SelectValue placeholder="→ Glava" />
            </SelectTrigger>
            <SelectContent>
              {availableChapters.map(ch => (
                <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {otherSubs.length > 0 && (
          <Select onValueChange={onMoveSub}>
            <SelectTrigger className="h-7 w-32 text-[10px] border-dashed">
              <SelectValue placeholder="→ Potkat." />
            </SelectTrigger>
            <SelectContent>
              {otherSubs.map(s => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────
export default function CardOrgMode({ cards, categoryId, subcategoryNodes, patchCard }: Props) {
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(cards, subcategoryNodes), [cards, subcategoryNodes]);
  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  // Auto-expand on mount if only 1-3 subcategories
  useEffect(() => {
    if (tree.length <= 3) {
      setExpandedSubs(new Set(tree.map(n => n.subcategory)));
    }
  }, [tree.length]);

  const findCardContainer = useCallback((cardId: string): { sub: string; chapter: string } | null => {
    for (const node of tree) {
      for (const ch of node.chapters) {
        if (ch.cards.some(c => c.id === cardId)) return { sub: node.subcategory, chapter: ch.chapter };
      }
      if (node.unassigned.some(c => c.id === cardId)) return { sub: node.subcategory, chapter: "" };
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
    patchCard(cardId, c => ({ ...c, chapterId: chapter || undefined }));
  }, [patchCard]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCardId = active.id as string;
    const overId = over.id as string;

    const dropTarget = parseChapterDropId(overId);
    if (dropTarget) {
      const targetSub = dropTarget.subcategory === "(Bez potkategorije)" ? "" : dropTarget.subcategory;
      patchCard(activeCardId, c => ({
        ...c,
        chapterId: dropTarget.chapter,
        subcategoryId: targetSub,
        sortOrder: 9999,
      }));
      return;
    }

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
        chapterId: overContainer.chapter,
        subcategoryId: targetSub,
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
        Nema modula za organizaciju.
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
      <div className="space-y-4">
        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground px-1">
          <span className="flex items-center gap-1.5">
            <GripVertical className="h-3 w-3" /> Prevuci za premještanje
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-dashed border-primary/40 bg-primary/5" /> Ispusti ovdje
          </span>
        </div>

        {tree.map(node => {
          const isExpanded = expandedSubs.has(node.subcategory);
          const totalCards = node.chapters.reduce((sum, ch) => sum + ch.cards.length, 0) + node.unassigned.length;
          const isUnassigned = node.subcategory === "(Bez potkategorije)";

          return (
            <div
              key={node.subcategory}
              className={cn(
                "rounded-xl border overflow-hidden transition-colors",
                isUnassigned ? "border-orange-500/20 bg-orange-500/[0.02]" : "border-border bg-card"
              )}
            >
              {/* Subcategory header */}
              <button
                onClick={() => toggleSub(node.subcategory)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                {isUnassigned
                  ? <Inbox className="h-4 w-4 text-orange-500/70 shrink-0" />
                  : <FolderOpen className="h-4 w-4 text-primary/70 shrink-0" />
                }
                <span className={cn(
                  "text-sm font-semibold flex-1 text-left truncate",
                  isUnassigned ? "text-orange-600 dark:text-orange-400" : "text-foreground"
                )}>
                  {node.subcategory}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {node.chapters.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {node.chapters.length} {node.chapters.length === 1 ? "glava" : "glava"}
                    </span>
                  )}
                  <Badge
                    variant={isUnassigned ? "outline" : "secondary"}
                    className={cn("text-[10px]", isUnassigned && "border-orange-500/30 text-orange-600 dark:text-orange-400")}
                  >
                    {totalCards} {totalCards === 1 ? "modul" : "modula"}
                  </Badge>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t px-4 py-3 space-y-3">
                  {/* Chapters */}
                  {node.chapters.map(ch => (
                    <DroppableChapterZone
                      key={ch.chapter}
                      sub={node.subcategory}
                      chapter={ch.chapter}
                      count={ch.cards.length}
                    >
                      <SortableContext items={ch.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {ch.cards.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground italic text-center py-2">
                            Prevuci modul ovdje
                          </p>
                        ) : (
                          ch.cards.map((card, idx) => (
                            <SortableCardTile key={card.id} card={card} index={idx} />
                          ))
                        )}
                      </SortableContext>
                    </DroppableChapterZone>
                  ))}

                  {/* Unassigned cards */}
                  {node.unassigned.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <Inbox className="h-3.5 w-3.5 text-orange-500/60" />
                        <span className="text-xs font-medium text-orange-600/80 dark:text-orange-400/80">
                          Bez glave
                        </span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-orange-500/30 text-orange-600/70 dark:text-orange-400/70 ml-auto">
                          {node.unassigned.length}
                        </Badge>
                      </div>
                      <SortableContext items={node.unassigned.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {node.unassigned.map((card, idx) => {
                          const availableChapters = node.chapters.map(ch => typeof ch === "string" ? ch : ch.chapter);
                          const otherSubs = tree
                            .filter(n => n.subcategory !== node.subcategory)
                            .map(n => n.subcategory);
                          return (
                            <UnassignedCardRow
                              key={card.id}
                              card={card}
                              index={idx}
                              availableChapters={availableChapters}
                              otherSubs={otherSubs}
                              onAssignChapter={v => assignChapter(card.id, v)}
                              onMoveSub={v => {
                                const targetSub = v === "(Bez potkategorije)" ? "" : v;
                                patchCard(card.id, c => ({ ...c, subcategoryId: targetSub }));
                              }}
                            />
                          );
                        })}
                      </SortableContext>
                    </div>
                  )}

                  {node.chapters.length === 0 && node.unassigned.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-4">
                      Prazna potkategorija — prevuci module ovdje
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {createPortal(
        <DragOverlay dropAnimation={null}>
          {activeCard ? <CardDragOverlay card={activeCard} /> : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
