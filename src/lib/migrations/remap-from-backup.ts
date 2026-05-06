/**
 * Remap stale card.subcategoryId / chapterId koristeći stari JSON backup.
 *
 * Strategija: za svaku karticu iz backupa koju nađemo u trenutnoj IDB bazi (po card.id),
 * iz backup hijerarhije pročitamo IME stare podkategorije/glave i nađemo IME u
 * trenutnoj kategoriji → uzmemo NOVI UUID. Ako ime ne postoji više → reset ("").
 *
 * Ne mijenja: question, sections, FSRS state, categoryId.
 */

import { db } from "@/lib/db";
import { yieldUI } from "@/lib/backup/yield-ui";
import {
  isMinimalBackup,
  normalizeName,
  type BackupCategory,
  type MinimalBackup,
} from "./backup-schema";

export type RemapProgress = (pct: number, label: string) => void;

export interface BackupRemapReport {
  cardsInBackup: number;
  matchedCards: number;
  remappedSubcategory: number;
  remappedChapter: number;
  resetSubcategory: number;
  resetChapter: number;
  unchanged: number;
  errors: string[];
}

interface OldSubInfo {
  catId: string;
  subName: string;
  chapters: Map<string, string>; // oldChapId → chapName
}

interface CurrentCatIndex {
  catIdsByName: Map<string, string>; // normName → catId
  subByCat: Map<string, Map<string, string>>; // catId → (normSubName → subId)
  chapBySub: Map<string, Map<string, string>>; // subId → (normChapName → chapId)
}

function buildOldIndex(categories: BackupCategory[]): {
  oldSubInfo: Map<string, OldSubInfo>;
  oldCatNameById: Map<string, string>;
} {
  const oldSubInfo = new Map<string, OldSubInfo>();
  const oldCatNameById = new Map<string, string>();
  for (const cat of categories) {
    if (!cat?.id) continue;
    oldCatNameById.set(cat.id, cat.name);
    for (const sub of cat.subcategories ?? []) {
      if (!sub?.id) continue;
      const chapters = new Map<string, string>();
      for (const ch of sub.chapters ?? []) {
        if (ch?.id) chapters.set(ch.id, ch.name);
      }
      oldSubInfo.set(sub.id, { catId: cat.id, subName: sub.name, chapters });
    }
  }
  return { oldSubInfo, oldCatNameById };
}

interface DbCategoryLike {
  id: string;
  name: string;
  subcategories?: Array<{
    id: string;
    name: string;
    chapters?: Array<{ id: string; name: string }>;
  }>;
}

function buildCurrentIndex(catRecords: DbCategoryLike[]): CurrentCatIndex {
  const catIdsByName = new Map<string, string>();
  const subByCat = new Map<string, Map<string, string>>();
  const chapBySub = new Map<string, Map<string, string>>();
  for (const cat of catRecords) {
    catIdsByName.set(normalizeName(cat.name), cat.id);
    const subMap = new Map<string, string>();
    for (const sub of cat.subcategories ?? []) {
      subMap.set(normalizeName(sub.name), sub.id);
      const chMap = new Map<string, string>();
      for (const ch of sub.chapters ?? []) {
        chMap.set(normalizeName(ch.name), ch.id);
      }
      chapBySub.set(sub.id, chMap);
    }
    subByCat.set(cat.id, subMap);
  }
  return { catIdsByName, subByCat, chapBySub };
}

interface CardPatch {
  id: string;
  subcategoryId: string;
  chapterId: string;
}

export async function remapFromBackup(
  backupJson: unknown,
  options: { dryRun?: boolean; onProgress?: RemapProgress } = {}
): Promise<BackupRemapReport> {
  const onProgress = options.onProgress ?? (() => { /* noop */ });
  const report: BackupRemapReport = {
    cardsInBackup: 0,
    matchedCards: 0,
    remappedSubcategory: 0,
    remappedChapter: 0,
    resetSubcategory: 0,
    resetChapter: 0,
    unchanged: 0,
    errors: [],
  };

  if (!isMinimalBackup(backupJson)) {
    report.errors.push(
      "Neispravan format backupa: očekuje se objekat sa nizovima 'categories' i 'cards'."
    );
    return report;
  }
  const backup: MinimalBackup = backupJson;
  report.cardsInBackup = backup.cards.length;

  const { oldSubInfo, oldCatNameById } = buildOldIndex(backup.categories);

  const [catRecords, currentCards] = await Promise.all([
    db.categories.toArray(),
    db.cards.toArray(),
  ]);
  const current = buildCurrentIndex(catRecords as unknown as DbCategoryLike[]);

  const currentById = new Map(currentCards.map((c) => [c.id, c]));
  const patches: CardPatch[] = [];

  const total = backup.cards.length;
  onProgress(10, `Analiza ${total} kartica…`);
  let processed = 0;
  for (const oldCard of backup.cards) {
    if (++processed % 1000 === 0) {
      onProgress(10 + Math.round((processed / Math.max(total, 1)) * 70), `Analiza ${processed}/${total}…`);
      await yieldUI();
    }
    const cur = currentById.get(oldCard.id);
    if (!cur) continue;
    report.matchedCards++;

    // Resolve target categoryId in current DB.
    // Trenutna kartica zadržava svoj postojeći categoryId — ne diramo ga.
    const targetCatId = cur.categoryId;
    if (!targetCatId) continue;

    const subMap = current.subByCat.get(targetCatId);
    if (!subMap) {
      report.unchanged++;
      continue;
    }

    let newSubId = cur.subcategoryId ?? "";
    let newChapId = cur.chapterId ?? "";
    let subRemapped = false;
    let chapRemapped = false;
    let subReset = false;
    let chapReset = false;

    const oldSubId = oldCard.subcategoryId;
    if (oldSubId) {
      const info = oldSubInfo.get(oldSubId);
      if (info) {
        const matchedSub = subMap.get(normalizeName(info.subName));
        if (matchedSub) {
          if (matchedSub !== cur.subcategoryId) {
            newSubId = matchedSub;
            subRemapped = true;
          }
          // chapter: ime mora postojati u novoj sub
          const oldChapId = oldCard.chapterId;
          if (oldChapId) {
            const oldChapName = info.chapters.get(oldChapId);
            const chMap = current.chapBySub.get(matchedSub);
            const matchedChap = oldChapName && chMap ? chMap.get(normalizeName(oldChapName)) : undefined;
            if (matchedChap) {
              if (matchedChap !== cur.chapterId) {
                newChapId = matchedChap;
                chapRemapped = true;
              }
            } else {
              if (cur.chapterId) {
                newChapId = "";
                chapReset = true;
              }
            }
          } else {
            // u backupu nema chapter — ako trenutna ima stale chapter unutar promijenjene sub, resetuj
            if (subRemapped && cur.chapterId) {
              newChapId = "";
              chapReset = true;
            }
          }
        } else {
          // Ime stare podkategorije više ne postoji — reset
          if (cur.subcategoryId) {
            newSubId = "";
            subReset = true;
          }
          if (cur.chapterId) {
            newChapId = "";
            chapReset = true;
          }
        }
      }
      // ako oldSubId nije u backup indeksu (slomljen backup) — preskoči
    }

    if (subRemapped || chapRemapped || subReset || chapReset) {
      patches.push({ id: cur.id, subcategoryId: newSubId, chapterId: newChapId });
      if (subRemapped) report.remappedSubcategory++;
      if (chapRemapped) report.remappedChapter++;
      if (subReset) report.resetSubcategory++;
      if (chapReset) report.resetChapter++;
    } else {
      report.unchanged++;
    }
  }

  if (!options.dryRun && patches.length > 0) {
    onProgress(85, `Primjena izmjena (${patches.length})…`);
    try {
      await db.transaction("rw", db.cards, async () => {
        let i = 0;
        for (const p of patches) {
          await db.cards.update(p.id, {
            subcategoryId: p.subcategoryId,
            chapterId: p.chapterId,
          });
          if (++i % 500 === 0) {
            onProgress(85 + Math.round((i / patches.length) * 13), `Zapis ${i}/${patches.length}…`);
            await yieldUI();
          }
        }
      });
    } catch (err) {
      report.errors.push(
        `Greška pri zapisu u bazu: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  onProgress(100, "Završeno.");
  // Suppress unused warning
  void oldCatNameById;

  return report;
}
