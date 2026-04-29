import { type Card } from "@/lib/spaced-repetition";
import { type SubcategoryNode } from "@/lib/db";

export interface TreeNode {
  subcategory: string;
  subcategoryId: string;
  chapters: { chapter: string; chapterId: string; cards: Card[] }[];
  unassigned: Card[];
  /** Cards whose subcategoryId or chapterId pointed to a node that no longer exists. */
  staleCardIds?: string[];
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
  const nodeMap = new Map<string, { chapters: Map<string, Card[]>; unassigned: Card[]; staleCardIds: string[] }>();

  // Build registries of valid IDs and chapter→sub mapping for mismatch detection.
  const validSubIds = new Set<string>();
  const validChapIds = new Set<string>();
  const chapToSub = new Map<string, string>();
  for (const node of subcategoryNodes) {
    validSubIds.add(node.id);
    const chMap = new Map<string, Card[]>();
    for (const ch of node.chapters) {
      const chId = typeof ch === "string" ? ch : ch.id;
      chMap.set(chId, []);
      validChapIds.add(chId);
      chapToSub.set(chId, node.id);
    }
    nodeMap.set(node.id, { chapters: chMap, unassigned: [], staleCardIds: [] });
  }

  if (!nodeMap.has(UNCAT_KEY)) {
    nodeMap.set(UNCAT_KEY, { chapters: new Map(), unassigned: [], staleCardIds: [] });
  }

  for (const card of cards) {
    const rawSub = card.subcategoryId || "";
    const subValid = rawSub && validSubIds.has(rawSub);
    // Stale subcategoryId → bucket into UNCAT but mark as stale.
    const targetSubKey = subValid ? rawSub : UNCAT_KEY;
    const isStaleSub = !!rawSub && !subValid;

    const entry = nodeMap.get(targetSubKey)!;

    const cardChap = card.chapterId || "";
    const chapValid = !!cardChap && validChapIds.has(cardChap);
    const chapMismatch = subValid && chapValid && chapToSub.get(cardChap) !== rawSub;
    const isStaleChap = !!cardChap && !chapValid;

    if (isStaleSub || isStaleChap || chapMismatch) {
      entry.staleCardIds.push(card.id);
    }

    if (chapValid && !isStaleSub && !chapMismatch && entry.chapters.has(cardChap)) {
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
    const displayName = subNameMap.get(sub) || (sub === UNCAT_KEY ? UNCAT_KEY : sub);
    if (totalCards > 0 || isCanonical) {
      result.push({
        subcategory: displayName,
        subcategoryId: sub === UNCAT_KEY ? "" : sub,
        chapters,
        unassigned: entry.unassigned,
        staleCardIds: entry.staleCardIds.length > 0 ? entry.staleCardIds : undefined,
      });
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
