import { useMemo } from "react";
import { Card } from "@/lib/spaced-repetition";
import type { Source, CategoryRecord } from "@/lib/db-types";
import { getCardMasteryLevel } from "@/lib/mastery";

export type DepthMode = "A" | "B";

export interface HierarchyNode {
  id: string;
  name: string;
  cardCount: number;
  levels: number[];
  avgStability: number;
  children: HierarchyLeaf[];
}

export interface HierarchyLeaf {
  id: string;
  name: string;
  cards: Card[];
  cardCount: number;
  levels: number[];
  avgStability: number;
}

export interface SourceHierarchyResult {
  mode: DepthMode;
  tree: HierarchyNode[];
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

function buildNameMaps(records: CategoryRecord[], categoryId: string) {
  const subNameMap: Record<string, string> = {};
  const chapNameMap: Record<string, string> = {};
  const rec = records.find(r => r.id === categoryId);
  if (rec) {
    for (const s of rec.subcategories || []) {
      subNameMap[s.id] = s.name;
      for (const ch of s.chapters || []) {
        if (typeof ch === "object") chapNameMap[ch.id] = ch.name;
      }
    }
  }
  return { subNameMap, chapNameMap };
}

export function useSourceHierarchy(
  cards: Card[],
  _sources: Source[],
  category: string,
  categoryRecords: CategoryRecord[],
): SourceHierarchyResult {
  return useMemo(() => {
    const catCards = cards.filter(c => c.categoryId === category);
    const sourceLinked = catCards.filter(c => c.sourceId);

    if (sourceLinked.length === 0) {
      return { mode: "B" as DepthMode, tree: [], hasSourceLinks: false };
    }

    const { subNameMap, chapNameMap } = buildNameMaps(categoryRecords, category);

    const tree: HierarchyNode[] = [];
    const bySub = new Map<string, Map<string, Card[]>>();

    for (const card of catCards) {
      const subId = card.subcategoryId || "__ostalo__";
      if (!bySub.has(subId)) bySub.set(subId, new Map());
      const chapMap = bySub.get(subId)!;
      const chapId = card.chapterId || "__ostalo__";
      if (!chapMap.has(chapId)) chapMap.set(chapId, []);
      chapMap.get(chapId)!.push(card);
    }

    for (const [subId, chapMap] of bySub) {
      const allCards: Card[] = [];
      const children: HierarchyLeaf[] = [];

      for (const [chapId, chapCards] of chapMap) {
        allCards.push(...chapCards);
        children.push({
          id: chapId,
          name: chapId === "__ostalo__" ? "Ostalo" : (chapNameMap[chapId] || chapId),
          cards: chapCards,
          cardCount: chapCards.length,
          levels: computeLevels(chapCards),
          avgStability: computeAvgStability(chapCards),
        });
      }

      tree.push({
        id: subId,
        name: subId === "__ostalo__" ? "Ostalo" : (subNameMap[subId] || subId),
        cardCount: allCards.length,
        levels: computeLevels(allCards),
        avgStability: computeAvgStability(allCards),
        children,
      });
    }

    tree.sort((a, b) => b.cardCount - a.cardCount);
    return { mode: "B" as DepthMode, tree, hasSourceLinks: true };
  }, [cards, _sources, category, categoryRecords]);
}
