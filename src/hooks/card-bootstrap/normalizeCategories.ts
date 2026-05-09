import { db, type CategoryRecord, type SubcategoryNode, type ChapterNode } from "@/lib/db";
import { Card } from "@/lib/spaced-repetition";
import { stableLegacyId } from "@/lib/stable-id";

/**
 * Normalizes legacy `string[]` subcategories into `SubcategoryNode[]`,
 * synthesizes fallback nodes for orphaned cards, prunes phantom UUID-named
 * nodes, and fire-and-forget persists changes back to IDB.
 */
export function normalizeCategories(
  { cards, catRecords }: { cards: Card[]; catRecords: CategoryRecord[] },
): { finalRecords: CategoryRecord[] } {
  // Build card-by-category index O(n)
  const cardsByCat = new Map<string, Card[]>();
  for (const card of cards) {
    const arr = cardsByCat.get(card.categoryId) || [];
    arr.push(card);
    cardsByCat.set(card.categoryId, arr);
  }

  const updatedRecords: CategoryRecord[] = [];
  let needsPersist = false;

  for (const r of catRecords) {
    // Migrate legacy string[] to SubcategoryNode[] with deterministic ids
    let nodes: SubcategoryNode[] = (r.subcategories || []).map((s: unknown, i: number) => {
      if (typeof s === "string") {
        needsPersist = true;
        return { id: stableLegacyId(r.id, s), name: s, chapters: [] as ChapterNode[], sortOrder: i };
      }
      const sObj = s as Partial<SubcategoryNode> & { name: string };
      const subId = sObj.id || stableLegacyId(r.id, sObj.name);
      const node: SubcategoryNode = {
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
      if (!sObj.id) needsPersist = true;
      return node;
    });

    const catCards = cardsByCat.get(r.id) || [];
    const nodeMap = new Map<string, SubcategoryNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

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
        if (import.meta.env.DEV) console.log(`[boot] fallback SubcategoryNode created: "${sub}" in category ${r.name}`);
      }
      if (ch && !node.chapters.some(c => c.id === ch)) {
        node.chapters.push({ id: ch, name: ch, sortOrder: node.chapters.length });
        needsPersist = true;
        if (import.meta.env.DEV) console.log(`[boot] fallback chapter registered: "${ch}" under "${sub}" in ${r.name}`);
      }
    }

    // Phantom prune: remove UUID-named nodes with zero cards
    const uuidPattern = /^[0-9a-f]{8}-/;
    const cardSubIds = new Set(catCards.map(card => card.subcategoryId).filter(Boolean));
    nodes = nodes.filter(n => {
      if (!uuidPattern.test(n.name)) return true;
      if (cardSubIds.has(n.id)) return true;
      if (import.meta.env.DEV) console.log(`[boot] removing phantom subcategory: "${n.name}" from ${r.name}`);
      needsPersist = true;
      return false;
    });
    for (const n of nodes) {
      const cardChapIds = new Set(catCards.filter(card => card.subcategoryId === n.id).map(card => card.chapterId).filter(Boolean));
      n.chapters = n.chapters.filter(ch => {
        if (!uuidPattern.test(ch.name)) return true;
        if (cardChapIds.has(ch.id)) return true;
        if (import.meta.env.DEV) console.log(`[boot] removing phantom chapter: "${ch.name}" from ${n.name}`);
        needsPersist = true;
        return false;
      });
    }

    updatedRecords.push({ ...r, subcategories: nodes });
  }

  // Persist migrated/fallback nodes back to IDB (fire-and-forget)
  if (needsPersist && db) {
    Promise.all(
      updatedRecords.map((rec) =>
        db!.categories.update(rec.id, { subcategories: rec.subcategories }).catch((e: unknown) =>
          console.warn("[boot] fallback persist failed for", rec.name, e)
        )
      )
    ).catch(() => {});
  }

  const finalRecords = needsPersist ? updatedRecords : catRecords;
  return { finalRecords };
}
