/**
 * Pure normalizer za CategoryRecord oblike — bez IDB write-a, bez log-ova.
 * Vraća (records, needsPersist). Persist je odgovornost pozivaoca.
 *
 * Funkcionalnosti:
 *   • Migracija legacy `string[]` subcategories u `SubcategoryNode[]`
 *     sa deterministički generisanim ID-evima (preko `stableLegacyId`).
 *   • Sintetizacija fallback subcat/chapter čvorova za osirotjele kartice.
 *   • Phantom prune: uklanjanje UUID-imenovanih subcat/chapter čvorova
 *     bez ijedne kartice.
 */
import type { CategoryRecord, SubcategoryNode, ChapterNode } from "@/lib/db";
import type { Card } from "@/lib/spaced-repetition";
import { stableLegacyId } from "@/lib/stable-id";

const UUID_PATTERN = /^[0-9a-f]{8}-/;

export interface NormalizeResult {
  records: CategoryRecord[];
  needsPersist: boolean;
}

export function normalizeCategoryShapes(
  cards: Card[],
  catRecords: CategoryRecord[],
): NormalizeResult {
  // O(n) card-by-category index
  const cardsByCat = new Map<string, Card[]>();
  for (const card of cards) {
    const arr = cardsByCat.get(card.categoryId) || [];
    arr.push(card);
    cardsByCat.set(card.categoryId, arr);
  }

  const updated: CategoryRecord[] = [];
  let needsPersist = false;

  for (const r of catRecords) {
    let nodes: SubcategoryNode[] = (r.subcategories || []).map((s: unknown, i: number) => {
      if (typeof s === "string") {
        needsPersist = true;
        return { id: stableLegacyId(r.id, s), name: s, chapters: [] as ChapterNode[], sortOrder: i };
      }
      const sObj = s as Partial<SubcategoryNode> & { name: string };
      const subId = sObj.id || stableLegacyId(r.id, sObj.name);
      if (!sObj.id) needsPersist = true;
      return {
        id: subId,
        name: sObj.name,
        sortOrder: sObj.sortOrder ?? i,
        chapters: ((sObj.chapters || []) as unknown[]).map((ch, ci): ChapterNode => {
          if (typeof ch === "string") {
            needsPersist = true;
            return { id: stableLegacyId(subId, ch), name: ch, sortOrder: ci };
          }
          const c = ch as Partial<ChapterNode> & { name: string };
          if (!c.id) {
            needsPersist = true;
            return { ...c, id: stableLegacyId(subId, c.name), sortOrder: c.sortOrder ?? ci } as ChapterNode;
          }
          return c as ChapterNode;
        }),
      };
    });

    const catCards = cardsByCat.get(r.id) || [];
    const nodeMap = new Map<string, SubcategoryNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    // Fallback sintetizacija za osirotjele kartice
    for (const card of catCards) {
      const sub = card.subcategoryId || "";
      const ch = card.chapterId || "";
      if (!sub) continue;

      let node = nodeMap.get(sub);
      if (!node) {
        node = { id: sub, name: sub, chapters: [], sortOrder: nodes.length };
        nodes.push(node);
        nodeMap.set(sub, node);
        needsPersist = true;
      }
      if (ch && !node.chapters.some(c => c.id === ch)) {
        node.chapters.push({ id: ch, name: ch, sortOrder: node.chapters.length });
        needsPersist = true;
      }
    }

    // Phantom prune
    const cardSubIds = new Set(catCards.map(card => card.subcategoryId).filter(Boolean));
    nodes = nodes.filter(n => {
      if (!UUID_PATTERN.test(n.name)) return true;
      if (cardSubIds.has(n.id)) return true;
      needsPersist = true;
      return false;
    });
    for (const n of nodes) {
      const cardChapIds = new Set(
        catCards.filter(card => card.subcategoryId === n.id).map(card => card.chapterId).filter(Boolean),
      );
      n.chapters = n.chapters.filter(ch => {
        if (!UUID_PATTERN.test(ch.name)) return true;
        if (cardChapIds.has(ch.id)) return true;
        needsPersist = true;
        return false;
      });
    }

    updated.push({ ...r, subcategories: nodes });
  }

  return { records: needsPersist ? updated : catRecords, needsPersist };
}
