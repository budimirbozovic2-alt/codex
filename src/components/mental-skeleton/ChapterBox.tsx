import { ChevronDown, BookOpen, ArrowUp, ArrowDown, Edit3, Trash2 } from "lucide-react";
import React, { useMemo } from "react";
import { Card, SectionState } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, getMasteryColor } from "@/components/KnowledgeMap";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import DraggableCardTile from "./DraggableCardTile";
import { Mode, UNASSIGNED_CHAPTER } from "./types";

interface ChapterBoxProps {
  chapter: string;
  cards: Card[];
  mode: Mode;
  isOpen: boolean;
  onToggle: () => void;
  onCardClick: (card: Card) => void;
  onRename: (oldName: string) => void;
  onDelete: (name: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function ChapterBoxInner({
  chapter, cards, mode, isOpen, onToggle, onCardClick, onRename, onDelete, onMoveUp, onMoveDown,
}: ChapterBoxProps) {
  const isUnassigned = chapter === UNASSIGNED_CHAPTER;
  const displayName = isUnassigned ? "Nekategorisane" : chapter;
  const sortedCards = useMemo(() =>
    [...cards].sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0)),
    [cards]
  );

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `chapter-drop-${chapter}`,
    data: { type: "chapter", chapter },
  });

  const levelCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    cards.forEach(c => counts[getCardMasteryLevel(c)]++);
    return counts;
  }, [cards]);

  // Section-level progress stats
  const sectionStats = useMemo(() => {
    let total = 0, learned = 0, due = 0, avgStability = 0;
    cards.forEach(c => {
      c.sections.forEach(s => {
        total++;
        if (s.state === SectionState.Review || s.state === SectionState.Relearning) learned++;
        if (s.nextReview && s.nextReview <= Date.now()) due++;
        avgStability += s.stability;
      });
    });
    avgStability = total > 0 ? Math.round((avgStability / total) * 10) / 10 : 0;
    const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
    return { total, learned, due, avgStability, pct };
  }, [cards]);

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <div
        ref={setDropRef}
        className={`rounded-xl border transition-all duration-200 ${
          isOver
            ? "ring-2 ring-primary border-primary bg-primary/5 shadow-lg scale-[1.01]"
            : "bg-card"
        }`}
      >
        <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${isOver ? "" : "hover:bg-secondary/30"}`}>
          <CollapsibleTrigger className="flex items-center gap-3 flex-1 min-w-0">
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? "" : "-rotate-90"}`} />
            <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
            <div className="flex-1 text-left min-w-0">
              <span className={`text-sm font-medium transition-colors ${isOver ? "text-primary font-semibold" : ""}`}>{displayName}</span>
              <span className="ml-2 text-xs text-muted-foreground">{cards.length}</span>
              {isOver && <span className="ml-2 text-xs text-primary animate-pulse">← Pusti ovdje</span>}
            </div>
          </CollapsibleTrigger>
          {/* Section progress bar with tooltip — always visible when cards exist */}
          {cards.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground font-medium tabular-nums">{sectionStats.pct}%</span>
                  {mode === "auditor" ? (
                    <div className="flex h-2 w-24 rounded-full overflow-hidden bg-secondary">
                      {levelCounts.map((count, lvl) => {
                        if (count === 0) return null;
                        return (
                          <div key={lvl} style={{ width: `${(count / cards.length) * 100}%`, backgroundColor: getMasteryColor(lvl) }} />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-2 w-20 rounded-full overflow-hidden bg-secondary">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${sectionStats.pct}%`,
                          backgroundColor: sectionStats.pct >= 80 ? 'hsl(142, 60%, 40%)' : sectionStats.pct >= 50 ? 'hsl(45, 93%, 47%)' : 'hsl(25, 95%, 53%)',
                        }}
                      />
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs space-y-1 max-w-52">
                <p className="font-medium">{displayName}</p>
                <p>{sectionStats.learned}/{sectionStats.total} sekcija savladano ({sectionStats.pct}%)</p>
                {sectionStats.due > 0 && <p className="text-warning">{sectionStats.due} sekcija čeka ponavljanje</p>}
                <p>Prosječna stabilnost: {sectionStats.avgStability} dana</p>
                <p>{cards.length} kartica</p>
              </TooltipContent>
            </Tooltip>
          )}
          {!isUnassigned && mode === "navigator" && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {onMoveUp && (
                <div role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onMoveUp(); }} onKeyDown={e => e.key === "Enter" && onMoveUp()} className="p-1 rounded hover:bg-secondary transition-colors cursor-pointer" title="Pomjeri gore">
                  <ArrowUp className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              {onMoveDown && (
                <div role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onMoveDown(); }} onKeyDown={e => e.key === "Enter" && onMoveDown()} className="p-1 rounded hover:bg-secondary transition-colors cursor-pointer" title="Pomjeri dolje">
                  <ArrowDown className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <div role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onRename(chapter); }} onKeyDown={e => e.key === "Enter" && onRename(chapter)} className="p-1 rounded hover:bg-secondary transition-colors cursor-pointer">
                <Edit3 className="h-3 w-3 text-muted-foreground" />
              </div>
              <div role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onDelete(chapter); }} onKeyDown={e => e.key === "Enter" && onDelete(chapter)} className="p-1 rounded hover:bg-destructive/10 transition-colors cursor-pointer">
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
        <CollapsibleContent>
          <div className="pl-4 pr-2 py-3">
            <SortableContext items={sortedCards.map(c => c.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {sortedCards.map(card => (
                  <DraggableCardTile
                    key={card.id}
                    card={card}
                    mode={mode}
                    onClick={() => onCardClick(card)}
                  />
                ))}
              </div>
            </SortableContext>
            {cards.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Prevuci kartice ovdje</p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

const ChapterBox = React.memo(ChapterBoxInner);

export default ChapterBox;
