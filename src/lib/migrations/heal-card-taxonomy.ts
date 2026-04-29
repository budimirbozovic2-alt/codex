import { db } from "@/lib/db";

const FLAG_KEY = "taxonomy-healed-v1";

export interface HealReport {
  scanned: number;
  staleSubcategoryReset: number;
  staleChapterReset: number;
  mismatchChapterReset: number;
  skipped: boolean;
}

/**
 * One-shot conservative healer: any card whose `subcategoryId` or `chapterId`
 * points to a UUID that no longer exists in any category gets that field
 * reset to "" — the card stays in its category and surfaces as "Neraspoređeno"
 * where the user can drag-drop it to the correct sub/chapter.
 *
 * Also fixes mismatches: chapter that belongs to a different subcategory
 * than the card's `subcategoryId` (chapter wins → reset chapter only).
 *
 * Idempotent + flagged via localStorage so it never runs twice.
 */
export async function healCardTaxonomy(force = false): Promise<HealReport> {
  const empty: HealReport = {
    scanned: 0,
    staleSubcategoryReset: 0,
    staleChapterReset: 0,
    mismatchChapterReset: 0,
    skipped: false,
  };

  if (!force && typeof localStorage !== "undefined" && localStorage.getItem(FLAG_KEY) === "1") {
    return { ...empty, skipped: true };
  }

  try {
    const [cards, categories] = await Promise.all([
      db.cards.toArray(),
      db.categories.toArray(),
    ]);

    const subUuids = new Set<string>();
    const chapUuids = new Set<string>();
    /** chapterId → owning subcategoryId (for mismatch detection) */
    const chapToSub = new Map<string, string>();

    for (const cat of categories) {
      for (const sub of cat.subcategories ?? []) {
        if (sub.id) subUuids.add(sub.id);
        for (const ch of sub.chapters ?? []) {
          if (typeof ch === "object" && ch.id) {
            chapUuids.add(ch.id);
            chapToSub.set(ch.id, sub.id);
          }
        }
      }
    }

    let staleSub = 0;
    let staleChap = 0;
    let mismatch = 0;
    const updates: Array<Promise<unknown>> = [];

    for (const card of cards) {
      const patch: Partial<typeof card> = {};
      const subStale = !!card.subcategoryId && !subUuids.has(card.subcategoryId);
      const chapStale = !!card.chapterId && !chapUuids.has(card.chapterId);
      const chapMismatch =
        !subStale &&
        !!card.subcategoryId &&
        !!card.chapterId &&
        chapToSub.has(card.chapterId) &&
        chapToSub.get(card.chapterId) !== card.subcategoryId;

      if (subStale) {
        // Sub gone → chapter belonging to it is meaningless. Reset both.
        patch.subcategoryId = "";
        patch.chapterId = "";
        staleSub++;
      } else if (chapStale) {
        patch.chapterId = "";
        staleChap++;
      } else if (chapMismatch) {
        patch.chapterId = "";
        mismatch++;
      }

      if (Object.keys(patch).length > 0) {
        updates.push(db.cards.update(card.id, patch));
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(FLAG_KEY, "1");
    }

    return {
      scanned: cards.length,
      staleSubcategoryReset: staleSub,
      staleChapterReset: staleChap,
      mismatchChapterReset: mismatch,
      skipped: false,
    };
  } catch (err) {
    console.error("[heal-card-taxonomy] failed", err);
    return empty;
  }
}
