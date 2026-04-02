import { useState, useCallback, useMemo } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { type Card } from "@/lib/spaced-repetition";
import { type TreeNode, parseChapterDropId } from "@/components/category/org-mode/org-mode-utils";

interface UseCardOrgDndArgs {
  cards: Card[];
  tree: TreeNode[];
  patchCard: (id: string, fn: (c: Card) => Card) => void;
}

export function useCardOrgDnd({ cards, tree, patchCard }: UseCardOrgDndArgs) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  const findCardContainer = useCallback((cardId: string) => {
    for (const node of tree) {
      for (const ch of node.chapters) {
        if (ch.cards.some(c => c.id === cardId)) return { subId: node.subcategoryId, chapId: ch.chapterId };
      }
      if (node.unassigned.some(c => c.id === cardId)) return { subId: node.subcategoryId, chapId: "" };
    }
    return null;
  }, [tree]);

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
      patchCard(activeCardId, c => ({
        ...c,
        chapterId: dropTarget.chapterId,
        subcategoryId: dropTarget.subcategoryId,
        sortOrder: 9999,
      }));
      return;
    }

    const overCard = cardMap.get(overId);
    if (!overCard) return;

    const activeContainer = findCardContainer(activeCardId);
    const overContainer = findCardContainer(overId);
    if (!activeContainer || !overContainer) return;

    const sameContainer = activeContainer.subId === overContainer.subId && activeContainer.chapId === overContainer.chapId;

    if (sameContainer) {
      const chapterNode = tree
        .find(n => n.subcategoryId === overContainer.subId)
        ?.chapters.find(ch => ch.chapterId === overContainer.chapId);
      if (!chapterNode) return;

      const oldIndex = chapterNode.cards.findIndex(c => c.id === activeCardId);
      const newIndex = chapterNode.cards.findIndex(c => c.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = arrayMove(chapterNode.cards, oldIndex, newIndex);
      reordered.forEach((c, i) => {
        patchCard(c.id, card => ({ ...card, sortOrder: i }));
      });
    } else {
      const targetChapterNode = tree
        .find(n => n.subcategoryId === overContainer.subId)
        ?.chapters.find(ch => ch.chapterId === overContainer.chapId);
      if (!targetChapterNode) return;

      const overIdx = targetChapterNode.cards.findIndex(c => c.id === overId);
      const newList = targetChapterNode.cards.filter(c => c.id !== activeCardId);
      newList.splice(overIdx, 0, cardMap.get(activeCardId)!);

      patchCard(activeCardId, c => ({
        ...c,
        chapterId: overContainer.chapId || undefined,
        subcategoryId: overContainer.subId,
      }));

      newList.forEach((c, i) => {
        patchCard(c.id, card => ({ ...card, sortOrder: i }));
      });
    }
  }, [cardMap, tree, patchCard, findCardContainer]);

  const activeCard = activeId ? cardMap.get(activeId) ?? null : null;

  return { activeId, activeCard, handleDragStart, handleDragEnd, assignChapter };
}
