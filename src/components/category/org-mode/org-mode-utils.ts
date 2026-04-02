import { type Card } from "@/lib/spaced-repetition";
import { type SubcategoryNode } from "@/lib/db";

export interface TreeNode {
  subcategory: string;
  subcategoryId: string;
  chapters: { chapter: string; chapterId: string; cards: Card[] }[];
  unassigned: Card[];
}

export const chapterDropId = (subId: string, chapId: string) => `__drop__${subId}__${chapId}`;

export const parseChapterDropId = (id: string) => {
  if (!id.startsWith("__drop__")) return null;
  const rest = id.slice("__drop__".length);
  const sepIdx = rest.indexOf("__");
  if (sepIdx < 0) return null;
  return { subcategoryId: rest.slice(0, sepIdx), chapterId: rest.slice(sepIdx + 2) };
};

const UNCAT_KEY = "(Bez potkategorije)";

export function buildTree(cards: Card[], subcategoryNodes: SubcategoryNode[]): TreeNode[] {
  const nodeMap = new Map<string, { chapters: Map<string, Card[]>; unassigned: Card[] }>();

  for (const node of subcategoryNodes) {
    const chMap = new Map<string, Card[]>();
    for (const ch of node.chapters) chMap.set(typeof ch === "string" ? ch : ch.id, []);
    nodeMap.set(node.id, { chapters: chMap, unassigned: [] });
  }

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

  const subNameMap = new Map(subcategoryNodes.map(n => [n.id, n.name]));
  const chapNameMap = new Map<string, string>();
  for (const node of subcategoryNodes) {
    for (const ch of node.chapters) {
      if (typeof ch !== "string") chapNameMap.set(ch.id, ch.name);
    }
  }

  const result: TreeNode[] = [];
  for (const [sub, entry] of nodeMap) {
    const chapters = Array.from(entry.chapters.entries())
      .map(([chapterId, cards]) => ({
        chapter: chapNameMap.get(chapterId) || chapterId,
        chapterId,
        cards: cards.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }));
    const totalCards = chapters.reduce((sum, ch) => sum + ch.cards.length, 0) + entry.unassigned.length;
    const isCanonical = subcategoryNodes.some(n => n.id === sub);
    const displayName = subNameMap.get(sub) || sub;
    if (totalCards > 0 || isCanonical) {
      result.push({ subcategory: displayName, subcategoryId: sub === UNCAT_KEY ? "" : sub, chapters, unassigned: entry.unassigned });
    }
  }

  const sortOrderMap = new Map(subcategoryNodes.map(n => [n.id, n.sortOrder]));
  return result.sort((a, b) => {
    const aOrder = sortOrderMap.get(a.subcategoryId) ?? 999;
    const bOrder = sortOrderMap.get(b.subcategoryId) ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.subcategory.localeCompare(b.subcategory);
  });
}
