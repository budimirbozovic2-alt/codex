import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, FolderOpen, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Card } from "@/lib/spaced-repetition";
import { cn } from "@/lib/utils";
import { type TreeNode } from "./org-mode-utils";
import { SortableCardTile, DroppableChapterZone, UnassignedCardRow } from "./OrgCardTiles";

interface Props {
  node: TreeNode;
  isExpanded: boolean;
  onToggle: () => void;
  tree: TreeNode[];
  assignChapter: (cardId: string, chapter: string) => void;
  patchCard: (id: string, fn: (c: Card) => Card) => void;
}

export function OrgSubcategoryPanel({ node, isExpanded, onToggle, tree, assignChapter, patchCard }: Props) {
  const totalCards = node.chapters.reduce((sum, ch) => sum + ch.cards.length, 0) + node.unassigned.length;
  const isUnassigned = node.subcategory === "(Bez potkategorije)";

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        isUnassigned ? "border-orange-500/20 bg-orange-500/[0.02]" : "border-border bg-card"
      )}
    >
      <button
        onClick={onToggle}
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
          {node.chapters.map(ch => (
            <DroppableChapterZone
              key={ch.chapterId}
              subId={node.subcategoryId}
              chapId={ch.chapterId}
              displayName={ch.chapter}
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
                  const availableChapters = node.chapters.map(ch => ch.chapter);
                  const chapterIdMap = new Map(node.chapters.map(ch => [ch.chapter, ch.chapterId]));
                  const otherSubs = tree
                    .filter(n => n.subcategory !== node.subcategory)
                    .map(n => n.subcategory);
                  const subIdMap = new Map(tree.map(n => [n.subcategory, n.subcategoryId]));
                  return (
                    <UnassignedCardRow
                      key={card.id}
                      card={card}
                      index={idx}
                      availableChapters={availableChapters}
                      otherSubs={otherSubs}
                      onAssignChapter={v => {
                        const chapUuid = chapterIdMap.get(v) || v;
                        assignChapter(card.id, chapUuid);
                      }}
                      onMoveSub={v => {
                        const subUuid = subIdMap.get(v) || "";
                        patchCard(card.id, c => ({ ...c, subcategoryId: subUuid }));
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
}
