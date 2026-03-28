import { useMemo } from "react";
import { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/db";
import {
  loadSourceRegistry,
  buildAliasMap,
  buildSourceMap,
  getCategoryDepthMode,
  getCardMasterSource,
  type DepthMode,
import { getCardMasteryLevel } from "@/components/KnowledgeMap";

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
    for (const s of (card as any).sections ?? []) {
      if ((s.stability ?? 0) > 0) { total += s.stability; count++; }
    }
  }
  return count > 0 ? total / count : 0;
}

/**
 * Build a dynamic hierarchy tree for a category based on source registry.
 * Only activates when cards have sourceId links.
 */
export function useSourceHierarchy(
  cards: Card[],
  sources: Source[],
  category: string,
): SourceHierarchyResult {
  return useMemo(() => {
    const catCards = cards.filter(c => c.categoryId === category);
    const sourceLinked = catCards.filter(c => c.sourceId);

    // If no source links, return empty — caller should use original subcategory system
    if (sourceLinked.length === 0) {
      return { mode: "B" as DepthMode, tree: [], hasSourceLinks: false };
    }

    const registry = loadSourceRegistry();
    const aliasMap = buildAliasMap(registry);
    const sourceMap = buildSourceMap(sources);
    const mode = getCategoryDepthMode(category, cards, sourceMap, aliasMap, registry);

    const tree: HierarchyNode[] = [];

    if (mode === "A") {
      // Mode A: L1 = Master Source, L2 = Subcategory
      const bySource = new Map<string, Map<string, Card[]>>();

      for (const card of catCards) {
        const master = getCardMasterSource(card, sourceMap, aliasMap);
        if (!bySource.has(master)) bySource.set(master, new Map());
        const subMap = bySource.get(master)!;
        const sub = card.subcategory || "Ostalo";
        if (!subMap.has(sub)) subMap.set(sub, []);
        subMap.get(sub)!.push(card);
      }

      for (const [masterName, subMap] of bySource) {
        const allCards: Card[] = [];
        const children: HierarchyLeaf[] = [];

        for (const [subName, subCards] of subMap) {
          allCards.push(...subCards);
          children.push({
            name: subName,
            cards: subCards,
            cardCount: subCards.length,
            levels: computeLevels(subCards),
            avgStability: computeAvgStability(subCards),
          });
        }

        tree.push({
          name: masterName,
          cardCount: allCards.length,
          levels: computeLevels(allCards),
          avgStability: computeAvgStability(allCards),
          children,
        });
      }
    } else {
      // Mode B: L1 = Subcategory, L2 = Chapter
      const bySub = new Map<string, Map<string, Card[]>>();

      for (const card of catCards) {
        const sub = card.subcategory || "Ostalo";
        if (!bySub.has(sub)) bySub.set(sub, new Map());
        const chapMap = bySub.get(sub)!;
        const chap = card.chapter || "Ostalo";
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
    }

    // Sort by card count descending
    tree.sort((a, b) => b.cardCount - a.cardCount);

    return { mode, tree, hasSourceLinks: true };
  }, [cards, sources, category]);
}
