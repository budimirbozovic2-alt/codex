/**
 * Taxonomy merge — full 3-level remap & merge for backup-import.
 *
 * Closes the gap left by the original `buildCategoryIdRemap` +
 * `applyRemapToParsed` pair, which only remapped `card.categoryId`. In
 * non-overwrite modes a backup category with the same name as an existing
 * one had its `subcategories[]` / `chapters[]` silently discarded — cards
 * were left pointing at backup subcategory UUIDs that didn't exist in the
 * refactored DB, and the legacy resolver wiped them as orphans.
 *
 * This module does the full job pre-tx:
 *
 *   1. Match categories by lowercased name.
 *   2. For each matched pair, walk subcategories[] and chapters[]; same-name
 *      nodes get UUID-remapped, novel nodes are ADOPTED into the existing
 *      record so the backup's hierarchy survives merge.
 *   3. Produce the merged `CategoryRecord[]` snapshot that `writeCategoriesTx`
 *      should write via INSERT OR REPLACE.
 *   4. Surface three remaps so satellite tables AND cards
 *      (`card.subcategoryId` / `card.chapterId`) can be rewritten in one
 *      pass.
 *
 * Overwrite strategy: trivial — parsed.categories win wholesale, all three
 * remaps are empty.
 *
 * Pure / synchronous. No SQLite, no DOM. Idempotent.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord, SubcategoryNode, ChapterNode } from "@/lib/db-types";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { ImportStrategy } from "@/lib/backup/import-types";
import { yieldUI } from "@/lib/backup/yield-ui";
import { isCategoryRecordArray } from "@/lib/backup/import-remap";

export interface TaxonomyRemap {
  /** backup categoryId → live categoryId */
  categoryRemap: Map<string, string>;
  /** backup subcategoryId → live subcategoryId */
  subcategoryRemap: Map<string, string>;
  /** backup chapterId → live chapterId */
  chapterRemap: Map<string, string>;
  /**
   * Final `CategoryRecord[]` that should land in SQLite. In overwrite mode
   * this equals `parsed.categories`. In merge mode it equals the existing
   * category set with adopted-novel sub/chapter nodes appended in place.
   *
   * `writeCategoriesTx` consumes this directly (INSERT OR REPLACE).
   */
  mergedCategories: CategoryRecord[];
  /**
   * Subset of `mergedCategories` that actually needs to be written. In
   * non-overwrite mode this skips untouched existing categories so the tx
   * stays cheap on big libraries.
   */
  categoriesToWrite: CategoryRecord[];
}

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

/** Build the full 3-level remap + merged category snapshot. */
export function buildTaxonomyRemap(
  parsedCats: CategoryRecord[],
  existingCats: CategoryRecord[],
  strategy: ImportStrategy,
): TaxonomyRemap {
  const categoryRemap = new Map<string, string>();
  const subcategoryRemap = new Map<string, string>();
  const chapterRemap = new Map<string, string>();

  // ── Overwrite: parsed wins. No remap, but still pre-populate the
  //    UUID-identity remaps so satellite rows whose IDs happen to be in
  //    parsed don't get rewritten unnecessarily.
  if (strategy === "overwrite") {
    return {
      categoryRemap,
      subcategoryRemap,
      chapterRemap,
      mergedCategories: parsedCats,
      categoriesToWrite: parsedCats,
    };
  }

  // ── Merge path (skip / keep / newer). Existing wins on name collisions;
  //    novel nodes are adopted into the existing record. ──
  const existingByName = new Map<string, CategoryRecord>();
  for (const c of existingCats) existingByName.set(norm(c.name), c);

  // Working copy: we mutate cloned records so the originals stay intact for
  // diff-detection (categoriesToWrite below).
  const cloneCat = (c: CategoryRecord): CategoryRecord => ({
    ...c,
    subcategories: c.subcategories.map((s) => ({
      ...s,
      chapters: s.chapters.map((ch) => ({ ...ch })),
    })),
  });

  const liveById = new Map<string, CategoryRecord>();
  for (const c of existingCats) liveById.set(c.id, cloneCat(c));

  const touched = new Set<string>();
  const novelCats: CategoryRecord[] = [];

  for (const pc of parsedCats) {
    const liveMatch = existingByName.get(norm(pc.name));
    if (!liveMatch) {
      // Novel category — adopt as-is. All nested subs/chapters keep their
      // backup UUIDs (identity remap, nothing to write into the maps).
      novelCats.push(pc);
      continue;
    }
    if (liveMatch.id !== pc.id) categoryRemap.set(pc.id, liveMatch.id);

    const liveCat = liveById.get(liveMatch.id);
    if (!liveCat) continue; // defensive — populated above

    // ── Subcategories ──
    const liveSubsByName = new Map<string, SubcategoryNode>();
    for (const s of liveCat.subcategories) liveSubsByName.set(norm(s.name), s);

    for (const ps of pc.subcategories) {
      const liveSub = liveSubsByName.get(norm(ps.name));
      if (!liveSub) {
        // Novel subcategory — adopt wholesale (including chapters). Backup
        // UUIDs stay valid so card.subcategoryId/chapterId need no remap.
        liveCat.subcategories.push({
          ...ps,
          sortOrder: liveCat.subcategories.length,
          chapters: ps.chapters.map((ch) => ({ ...ch })),
        });
        touched.add(liveCat.id);
        continue;
      }
      if (liveSub.id !== ps.id) subcategoryRemap.set(ps.id, liveSub.id);

      // ── Chapters within the matched subcategory ──
      const liveChapsByName = new Map<string, ChapterNode>();
      for (const ch of liveSub.chapters) liveChapsByName.set(norm(ch.name), ch);

      for (const pch of ps.chapters) {
        const liveCh = liveChapsByName.get(norm(pch.name));
        if (!liveCh) {
          liveSub.chapters.push({
            ...pch,
            sortOrder: liveSub.chapters.length,
          });
          touched.add(liveCat.id);
        } else if (liveCh.id !== pch.id) {
          chapterRemap.set(pch.id, liveCh.id);
        }
      }
    }
  }

  const mergedCategories: CategoryRecord[] = [
    ...existingCats.map((c) => liveById.get(c.id) ?? c),
    ...novelCats,
  ];

  const categoriesToWrite: CategoryRecord[] = [
    ...existingCats
      .filter((c) => touched.has(c.id))
      .map((c) => liveById.get(c.id))
      .filter((c): c is CategoryRecord => !!c),
    ...novelCats,
  ];

  return {
    categoryRemap,
    subcategoryRemap,
    chapterRemap,
    mergedCategories,
    categoriesToWrite,
  };
}

/**
 * Apply the full taxonomy remap in-place to cards (list + map) and every
 * satellite table on `parsed`. Skips entirely if all three remaps are empty.
 *
 * Card-level remap is the critical bit that the legacy `applyRemapToParsed`
 * missed: `subcategoryId` and `chapterId` are now rewritten alongside
 * `categoryId`, so the post-merge resolver sees a coherent UUID tree.
 */
export async function applyTaxonomyRemap(
  remap: TaxonomyRemap,
  parsed: ParsedBackup,
  cardsToRemap: Card[],
  cardMap: Record<string, Card>,
): Promise<void> {
  const { categoryRemap, subcategoryRemap, chapterRemap } = remap;
  if (
    categoryRemap.size === 0 &&
    subcategoryRemap.size === 0 &&
    chapterRemap.size === 0
  ) {
    return;
  }

  const rewriteCard = (card: Card): void => {
    const rc = categoryRemap.get(card.categoryId);
    if (rc) card.categoryId = rc;
    if (card.subcategoryId) {
      const rs = subcategoryRemap.get(card.subcategoryId);
      if (rs) card.subcategoryId = rs;
    }
    if (card.chapterId) {
      const rch = chapterRemap.get(card.chapterId);
      if (rch) card.chapterId = rch;
    }
  };

  let i = 0;
  for (const card of cardsToRemap) {
    rewriteCard(card);
    if (++i % 1000 === 0) await yieldUI();
  }
  let j = 0;
  for (const id in cardMap) {
    rewriteCard(cardMap[id]);
    if (++j % 1000 === 0) await yieldUI();
  }

  // Satellite tables — only categoryId / subjectId. Sub/chap aren't FK'd on
  // these in the current schema, so a category-level remap is sufficient.
  if (categoryRemap.size > 0) {
    for (const src of parsed.sources) {
      const r = categoryRemap.get(src.categoryId);
      if (r) src.categoryId = r;
    }
    for (const mn of parsed.mnemonics) {
      const r = categoryRemap.get(mn.categoryId);
      if (r) mn.categoryId = r;
    }
    for (const a of parsed.knowledgeBaseArticles) {
      const r = categoryRemap.get(a.subjectId);
      if (r) a.subjectId = r;
    }
    for (const m of parsed.mindMaps) {
      if (m.categoryId) {
        const r = categoryRemap.get(m.categoryId);
        if (r) m.categoryId = r;
      }
    }
  }
}

/** Narrow helper: only run merge if parsed.categories is modern format. */
export function canMergeTaxonomy(parsed: ParsedBackup): boolean {
  return (
    Array.isArray(parsed.categories) &&
    parsed.categories.length > 0 &&
    isCategoryRecordArray(parsed.categories)
  );
}
