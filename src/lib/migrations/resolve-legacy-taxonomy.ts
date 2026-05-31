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

import type { CategoryRecord } from "@/lib/db-types";

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
  ambiguousMatches: { value: string; matches: string[] }[];
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
 * 2. Bidirektionalni substring (min length 4 da se izbjegnu "1"/"a" promašaji).
 * 3. Tokenizovani prefiks bez interpunkcije ("1.a" → "Glava 1.a").
 * Vraća { id, ambiguous } gdje je `ambiguous` lista alternativa kad je više od jednog matcha.
 */
function findByName(value: string, list: NamedNode[]): { id?: string; ambiguous?: string[] } {
  const v = normName(value);
  if (!v) return {};
  const exact = list.find((x) => x.norm === v);
  if (exact) return { id: exact.id };
  if (v.length >= 4) {
    const subs = list.filter((x) => x.norm.includes(v) || (x.norm.length >= 4 && v.includes(x.norm)));
    if (subs.length === 1) return { id: subs[0].id };
    if (subs.length > 1) return { id: subs[0].id, ambiguous: subs.map((s) => s.name) };
  }
  const stripped = v.replace(/[.,;:()\s-]+/g, "");
  if (stripped.length >= 2) {
    const tok = list.find((x) =>
      x.norm.replace(/[.,;:()\s-]+/g, "").includes(stripped),
    );
    if (tok) return { id: tok.id };
  }
  return {};
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
    ambiguousMatches: [],
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
        const match = subList ? findByName(curSubId, subList) : {};
        if (match.id) {
          if (match.ambiguous) report.ambiguousMatches.push({ value: curSubId, matches: match.ambiguous });
          curSubId = match.id;
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
        const match = chList ? findByName(curChapId, chList) : {};
        if (match.id) {
          if (match.ambiguous) report.ambiguousMatches.push({ value: curChapId, matches: match.ambiguous });
          curChapId = match.id;
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
