/**
 * Auto-Split Import Planner — pure domain logic.
 *
 * Takes detected articles + linked cards, returns user-mutable rows; turns
 * approved rows into an `ImportPlan` (cards to create + patches to apply).
 * No React, no DB, no toasts — fully unit-testable.
 */
import { sanitizeHtml } from "@/lib/sanitize";
import { htmlToDoc } from "@/lib/editor-v4";
import type { EditorDoc } from "@/lib/editor-v4/types";
import { createCard, type Card, type SourceModule } from "@/lib/spaced-repetition";
import { createTextAnchor, type Source } from "@/lib/sources-storage";
import type { DetectedArticle } from "@/lib/auto-split-engine";

export type ArticleStatus = "new" | "exists";

export interface ArticleRow {
  key: string;
  isGroup: boolean;
  groupName: string;
  articles: DetectedArticle[];
  essayName: string;
  selected: boolean;
  status: ArticleStatus;
  existingCardId?: string;
}

export interface CardUpdatePatch {
  question: string;
  sections: { title: string; content?: string; contentDoc: EditorDoc }[];
  sourceId: string;
  textAnchor: string;
  originalSourceSnippet: string;
  childCardIds?: string[];
  sourceModules?: SourceModule[];
}

export interface ImportPlan {
  toCreate: Card[];
  toUpdate: Array<{ id: string; patch: CardUpdatePatch }>;
}

export function buildArticleRows(
  detected: ReadonlyArray<DetectedArticle>,
  linkedCards: ReadonlyArray<Card>,
): ArticleRow[] {
  return detected.map((art) => {
    const existing = linkedCards.find((c) => {
      const q = c.question.toLowerCase();
      return q.includes(`čl. ${art.articleNum} `) || q.includes(`član ${art.articleNum}`);
    });
    return {
      key: `art-${art.articleNum}`,
      isGroup: false,
      groupName: "",
      articles: [art],
      essayName: art.essayName,
      selected: !existing,
      status: (existing ? "exists" : "new") as ArticleStatus,
      existingCardId: existing?.id,
    };
  });
}

export function mergeRows(
  rows: ReadonlyArray<ArticleRow>,
  indices: ReadonlyArray<number>,
  groupName: string,
): ArticleRow[] {
  if (indices.length < 2) return [...rows];
  const sortedIdx = [...indices].sort((a, b) => a - b);
  const selected = sortedIdx.map((i) => rows[i]).filter(Boolean);
  if (selected.length < 2) return [...rows];
  const allArticles = selected.flatMap((r) => r.articles);
  const merged: ArticleRow = {
    key: `group-${Date.now()}-${sortedIdx[0]}`,
    isGroup: true,
    groupName,
    articles: allArticles,
    essayName: groupName,
    selected: true,
    status: "new",
  };
  const remaining = rows.filter((_, i) => !sortedIdx.includes(i));
  const insertAt = Math.min(sortedIdx[0], remaining.length);
  return [...remaining.slice(0, insertAt), merged, ...remaining.slice(insertAt)];
}

export function ungroupRow(rows: ReadonlyArray<ArticleRow>, idx: number): ArticleRow[] {
  const row = rows[idx];
  if (!row?.isGroup) return [...rows];
  const singles: ArticleRow[] = row.articles.map((art) => ({
    key: `art-${art.articleNum}`,
    isGroup: false,
    groupName: "",
    articles: [art],
    essayName: art.essayName,
    selected: true,
    status: "new",
  }));
  return [...rows.slice(0, idx), ...singles, ...rows.slice(idx + 1)];
}

export function buildImportPlan(
  rows: ReadonlyArray<ArticleRow>,
  source: Source,
): ImportPlan {
  const toImport = rows.filter((r) => r.selected);
  const toCreate: Card[] = [];
  const toUpdate: ImportPlan["toUpdate"] = [];
  const category = source.categoryId;

  for (const row of toImport) {
    if (row.isGroup) {
      const sections = row.articles.map((art) => ({
        title: `Član ${art.articleNum}${art.title ? ` — ${art.title}` : ""}`,
        content: sanitizeHtml(art.contentHtml),
      }));
      const sourceModules: SourceModule[] = row.articles.map((art, index) => ({
        id: crypto.randomUUID(),
        order: index,
        articleNum: art.articleNum,
        title: `Član ${art.articleNum}${art.title ? ` — ${art.title}` : ""}`,
        question: art.essayName,
        textAnchor: createTextAnchor(art.plainSnippet),
        originalSourceSnippet: art.plainSnippet,
      }));
      const combinedSnippet = row.articles.map((a) => a.plainSnippet).join("\n\n");
      const card = createCard(row.essayName, sections, category);
      card.updatedAt = Date.now();
      card.sourceId = source.id;
      card.textAnchor = createTextAnchor(combinedSnippet);
      card.originalSourceSnippet = combinedSnippet;
      card.childCardIds = sourceModules.map((m) => m.id);
      card.sourceModules = sourceModules;
      toCreate.push(card);
    } else {
      const art = row.articles[0];
      const sectionHtml = sanitizeHtml(art.contentHtml);
      const sections = [{ title: "Odgovor", content: sectionHtml, contentDoc: htmlToDoc(sectionHtml) }];
      const anchor = createTextAnchor(art.plainSnippet);
      if (row.status === "exists" && row.existingCardId) {
        toUpdate.push({
          id: row.existingCardId,
          patch: {
            question: art.essayName,
            sections,
            sourceId: source.id,
            textAnchor: anchor,
            originalSourceSnippet: art.plainSnippet,
            childCardIds: undefined,
            sourceModules: undefined,
          },
        });
      } else {
        const card = createCard(art.essayName, sections, category);
        card.updatedAt = Date.now();
        card.sourceId = source.id;
        card.textAnchor = anchor;
        card.originalSourceSnippet = art.plainSnippet;
        toCreate.push(card);
      }
    }
  }

  return { toCreate, toUpdate };
}
