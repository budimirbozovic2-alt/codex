import { useMemo } from "react";
import { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/db";
import { getCardMasteryLevel } from "@/components/KnowledgeMap";

export type DepthMode = "A" | "B";

export interface HierarchyNode {
  name: string;
  cardCount: number;
  levels: number[]; // mastery level distribution [0..5]
  avgStability: number;
  children: HierarchyLeaf[];
}

export interface HierarchyLeaf {
  name: string;
  cards: Card[];
  cardCount: number;
  levels: number[];
  avgStability: number;
}

export interface SourceHierarchyResult {
  mode: DepthMode;
  tree: HierarchyNode[];
  /** True if at least some cards have sourceId links */
  hasSourceLinks: boolean;
}

function computeLevels(cards: Card[]): number[] {
  const levels = [0, 0, 0, 0, 0, 0];
  for (const c of cards) levels[getCardMasteryLevel(c)]++;
  return levels;
}

function computeAvgStability(cards: Card[]): number {
  let total = 0, count = 0;
  for (const card of cards) {
    for (const s of card.sections ?? []) {
      if ((s.stability ?? 0) > 0) { total += s.stability; count++; }
    }
  }
  return count > 0 ? total / count : 0;
}

/**
 * Build a dynamic hierarchy tree for a category.
 * Mode B (subcategory→chapter) is the default since registry is removed.
 */
export function useSourceHierarchy(
  cards: Card[],
  _sources: Source[],
  category: string,
): SourceHierarchyResult {
  return useMemo(() => {
    const catCards = cards.filter(c => c.categoryId === category);
    const sourceLinked = catCards.filter(c => c.sourceId);

    if (sourceLinked.length === 0) {
      return { mode: "B" as DepthMode, tree: [], hasSourceLinks: false };
    }

    // Default to Mode B: L1 = Subcategory, L2 = Chapter
    const tree: HierarchyNode[] = [];
    const bySub = new Map<string, Map<string, Card[]>>();

    for (const card of catCards) {
      const sub = card.subcategoryId || card.subcategory || "Ostalo";
      if (!bySub.has(sub)) bySub.set(sub, new Map());
      const chapMap = bySub.get(sub)!;
      const chap = card.chapterId || card.chapter || "Ostalo";
      if (!chapMap.has(chap)) chapMap.set(chap, []);
      chapMap.get(chap)!.push(card);
    }

    for (const [subName, chapMap] of bySub) {
      const allCards: Card[] = [];
      const children: HierarchyLeaf[] = [];

      for (const [chapName, chapCards] of chapMap) {
        allCards.push(...chapCards);
        children.push({
          name: chapName,
          cards: chapCards,
          cardCount: chapCards.length,
          levels: computeLevels(chapCards),
          avgStability: computeAvgStability(chapCards),
        });
      }

      tree.push({
        name: subName,
        cardCount: allCards.length,
        levels: computeLevels(allCards),
        avgStability: computeAvgStability(allCards),
        children,
      });
    }

    tree.sort((a, b) => b.cardCount - a.cardCount);
    return { mode: "B" as DepthMode, tree, hasSourceLinks: true };
  }, [cards, _sources, category]);
}