/**
 * Legacy taxonomy resolver.
 *
 * Stari (legacy) backupi često pohranjuju `card.subcategoryId` i `card.chapterId`
 * kao **ljudski-čitljive nazive** (npr. "1.a", "2.b", "Opći dio", "Glava 3"),
 * a ne kao stabilne UUID-ove. Ako takve vrijednosti uđu direktno u IDB,
 * kasnije se prikazuju kao raw stringovi i ruše navigaciju.
 *
 * Ovaj modul, pozvan IZMEĐU import-a kategorija i persist-a kartica,
 * pretvara takve nazive u trenutno-validne UUID-ove iz `CategoryRecord`-a.
 */

import type { CategoryRecord } from "@/lib/db-schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CardLikeForResolve {
  id: string;
  categoryId: string;
  subcategoryId?: string;
  chapterId?: string;
}

export interface LegacyResolveReport {
  scanned: number;
  resolvedSubcategory: number;
  resolvedChapter: number;
  unresolvedSubcategory: number;
  unresolvedChapter: number;
  alreadyValid: number;
}

interface NamedNode {
  id: string;
  norm: string;
  name: string;
}

interface CatIndex {
  subIdToCat: Map<string, string>;
  chapIdToSub: Map<string, string>;
  subsByCat: Map<string, NamedNode[]>;
  chapsBySub: Map<string, NamedNode[]>;
}

function normName(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isUuid(v: string | undefined): boolean {
  return !!v && UUID_RE.test(v);
}

function buildIndex(records: CategoryRecord[]): CatIndex {
  const subIdToCat = new Map<string, string>();
  const chapIdToSub = new Map<string, string>();
  const subsByCat = new Map<string, NamedNode[]>();
  const chapsBySub = new Map<string, NamedNode[]>();
  for (const cat of records) {
    const subList: NamedNode[] = [];
    for (const sub of cat.subcategories ?? []) {
      subIdToCat.set(sub.id, cat.id);
      subList.push({ id: sub.id, norm: normName(sub.name), name: sub.name });
      const chList: NamedNode[] = [];
      for (const ch of sub.chapters ?? []) {
        chapIdToSub.set(ch.id, sub.id);
        chList.push({ id: ch.id, norm: normName(ch.name), name: ch.name });
      }
      chapsBySub.set(sub.id, chList);
    }
    subsByCat.set(cat.id, subList);
  }
  return { subIdToCat, chapIdToSub, subsByCat, chapsBySub };
}

/**
 * Pokušaj match-a string vrijednosti na ime u listi:
 * 1. Egzaktno (normalizovano).
 * 2. Bidirektionalni substring.
 * 3. Tokenizovani prefiks bez interpunkcije ("1.a" → "Glava 1.a").
 */
function findByName(value: string, list: NamedNode[]): string | undefined {
  const v = normName(value);
  if (!v) return undefined;
  const exact = list.find((x) => x.norm === v);
  if (exact) return exact.id;
  const sub = list.find((x) => x.norm.includes(v) || v.includes(x.norm));
  if (sub) return sub.id;
  const stripped = v.replace(/[.,;:()\s-]+/g, "");
  if (stripped.length >= 2) {
    const tok = list.find((x) =>
      x.norm.replace(/[.,;:()\s-]+/g, "").includes(stripped),
    );
    if (tok) return tok.id;
  }
  return undefined;
}

/**
 * In-place mutate kartica. Idempotentno — sigurno za višestruko pozivanje.
 */
export function resolveLegacyTaxonomyNames(
  cards: CardLikeForResolve[],
  categoryRecords: CategoryRecord[],
): LegacyResolveReport {
  const idx = buildIndex(categoryRecords);
  const report: LegacyResolveReport = {
    scanned: cards.length,
    resolvedSubcategory: 0,
    resolvedChapter: 0,
    unresolvedSubcategory: 0,
    unresolvedChapter: 0,
    alreadyValid: 0,
  };

  for (const card of cards) {
    const catId = card.categoryId;
    const subList = catId ? idx.subsByCat.get(catId) : undefined;

    let curSubId = card.subcategoryId ?? "";
    let curChapId = card.chapterId ?? "";
    let touched = false;

    // ── Subcategory ──
    if (curSubId) {
      const validUuid = isUuid(curSubId) && idx.subIdToCat.get(curSubId) === catId;
      if (!validUuid) {
        const matched = subList ? findByName(curSubId, subList) : undefined;
        if (matched) {
          curSubId = matched;
          report.resolvedSubcategory++;
          touched = true;
        } else {
          curSubId = "";
          if (curChapId) curChapId = "";
          report.unresolvedSubcategory++;
          touched = true;
        }
      }
    }

    // ── Chapter ── (samo ako imamo validan sub)
    if (curSubId && curChapId) {
      const chList = idx.chapsBySub.get(curSubId);
      const validUuid =
        isUuid(curChapId) && idx.chapIdToSub.get(curChapId) === curSubId;
      if (!validUuid) {
        const matched = chList ? findByName(curChapId, chList) : undefined;
        if (matched) {
          curChapId = matched;
          report.resolvedChapter++;
          touched = true;
        } else {
          curChapId = "";
          report.unresolvedChapter++;
          touched = true;
        }
      }
    } else if (!curSubId && curChapId) {
      curChapId = "";
      touched = true;
    }

    if (touched) {
      card.subcategoryId = curSubId;
      card.chapterId = curChapId;
    } else {
      report.alreadyValid++;
    }
  }

  return report;
}
