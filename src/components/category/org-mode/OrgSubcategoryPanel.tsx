import { memo, useMemo, useCallback } from "react";
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

function OrgSubcategoryPanelInner({ node, isExpanded, onToggle, tree, assignChapter, patchCard }: Props) {
  const totalCards = node.chapters.reduce((sum, ch) => sum + ch.cards.length, 0) + node.unassigned.length;
  const isUnassigned = node.subcategory === "(Bez potkategorije)";

  // PR-G5 / RC-5: hoist derived lookup maps to panel scope. Previously these
  // were rebuilt inside the unassigned-card .map() on every render — O(n×m)
  // per pointer-move during DnD. Now memoized per (node, tree) identity.
  const availableChapters = useMemo(
    () => node.chapters.map(ch => ch.chapter),
    [node.chapters],
  );
  const chapterIdMap = useMemo(
    () => new Map(node.chapters.map(ch => [ch.chapter, ch.chapterId])),
    [node.chapters],
  );
  const otherSubs = useMemo(
    () => tree.filter(n => n.subcategory !== node.subcategory).map(n => n.subcategory),
    [tree, node.subcategory],
  );
  const subIdMap = useMemo(
    () => new Map(tree.map(n => [n.subcategory, n.subcategoryId])),
    [tree],
  );

  const makeAssignChapter = useCallback(
    (cardId: string) => (v: string) => {
      const chapUuid = chapterIdMap.get(v) || v;
      assignChapter(cardId, chapUuid);
    },
    [chapterIdMap, assignChapter],
  );

  const makeMoveSub = useCallback(
    (cardId: string) => (v: string) => {
      const subUuid = subIdMap.get(v) || "";
      patchCard(cardId, c => ({ ...c, subcategoryId: subUuid }));
    },
    [subIdMap, patchCard],
  );

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        isUnassigned ? "border-warning/20 bg-warning/[0.02]" : "border-border bg-card"
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
          ? <Inbox className="h-4 w-4 text-warning/70 shrink-0" />
          : <FolderOpen className="h-4 w-4 text-primary/70 shrink-0" />
        }
        <span className={cn(
          "text-sm font-semibold flex-1 text-left truncate",
          isUnassigned ? "text-warning" : "text-foreground"
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
            className={cn("text-[10px]", isUnassigned && "border-warning/30 text-warning")}
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
                <Inbox className="h-3.5 w-3.5 text-warning/60" />
                <span className="text-xs font-medium text-warning/80 dark:text-warning/80">
                  Bez glave
                </span>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-warning/30 text-warning/70 dark:text-warning/70 ml-auto">
                  {node.unassigned.length}
                </Badge>
              </div>
              <SortableContext items={node.unassigned.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {node.unassigned.map((card, idx) => (
                  <UnassignedCardRow
                    key={card.id}
                    card={card}
                    index={idx}
                    availableChapters={availableChapters}
                    otherSubs={otherSubs}
                    onAssignChapter={makeAssignChapter(card.id)}
                    onMoveSub={makeMoveSub(card.id)}
                  />
                ))}
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

// PR-G5 / RC-5: memoize so unrelated panel re-renders during DnD pointer-move
// do not reconcile this subtree. Stable identity via `node`, `tree`,
// `isExpanded` + stable callback refs from parent.
export const OrgSubcategoryPanel = memo(OrgSubcategoryPanelInner);
