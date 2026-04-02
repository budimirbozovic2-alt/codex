import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { DndContext, pointerWithin, DragOverlay, MeasuringStrategy } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { type Card } from "@/lib/spaced-repetition";
import { type SubcategoryNode } from "@/lib/db";
import { buildTree } from "./org-mode/org-mode-utils";
import { CardDragOverlay } from "./org-mode/OrgCardTiles";
import { OrgSubcategoryPanel } from "./org-mode/OrgSubcategoryPanel";
import { useCardOrgDnd } from "@/hooks/useCardOrgDnd";

interface Props {
  cards: Card[];
  categoryId: string;
  subcategoryNodes: SubcategoryNode[];
  patchCard: (id: string, fn: (c: Card) => Card) => void;
}

export default function CardOrgMode({ cards, categoryId, subcategoryNodes, patchCard }: Props) {
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildTree(cards, subcategoryNodes), [cards, subcategoryNodes]);
  const { activeCard, handleDragStart, handleDragEnd, assignChapter } = useCardOrgDnd({ cards, tree, patchCard });

  useEffect(() => {
    if (tree.length <= 3) {
      setExpandedSubs(new Set(tree.map(n => n.subcategory)));
    }
  }, [tree.length]);

  const toggleSub = useCallback((sub: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub); else next.add(sub);
      return next;
    });
  }, []);

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
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground px-1">
          <span className="flex items-center gap-1.5">
            <GripVertical className="h-3 w-3" /> Prevuci za premještanje
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-dashed border-primary/40 bg-primary/5" /> Ispusti ovdje
          </span>
        </div>

        {tree.map(node => (
          <OrgSubcategoryPanel
            key={node.subcategory}
            node={node}
            isExpanded={expandedSubs.has(node.subcategory)}
            onToggle={() => toggleSub(node.subcategory)}
            tree={tree}
            assignChapter={assignChapter}
            patchCard={patchCard}
          />
        ))}
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
