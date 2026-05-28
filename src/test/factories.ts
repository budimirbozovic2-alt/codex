/**
 * PR-7b · Strict test factories.
 *
 * After v22 / contentDoc-required, tests must construct records with a valid
 * `contentDoc` (EditorDoc). These factories accept ergonomic HTML/MD literals
 * and seed the AST via `htmlToDoc` / `mdToHtml`, so test bodies stay readable.
 *
 * Do NOT emit legacy `content` / `htmlContent` fields here — those are gone
 * from the runtime types.
 */
import type { Card, Section } from "@/lib/spaced-repetition";
import type { Source, KnowledgeBaseArticle } from "@/lib/db-types";
import { htmlToDoc } from "@/lib/editor-v4";
import { mdToHtml } from "@/lib/editor-v4/migrate";
import { SectionState } from "@/lib/spaced-repetition";

let _id = 0;
function uid(prefix = "id"): string {
  _id++;
  return `${prefix}_${_id}`;
}

export interface MakeSectionInput {
  title?: string;
  html?: string;
}

export function makeSection(input: MakeSectionInput = {}): Section {
  const html = input.html ?? "<p></p>";
  return {
    id: uid("sec"),
    title: input.title ?? "Cjelina 1",
    contentDoc: htmlToDoc(html),
    state: SectionState.New,
    stability: 0,
    difficulty: 0,
    interval: 0,
    nextReview: 0,
    lastReviewed: null,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    firstReviewPending: true,
  };
}

export interface MakeCardInput extends Partial<Omit<Card, "sections">> {
  sectionsHtml?: string[];
  sections?: Section[];
}

export function makeCard(input: MakeCardInput = {}): Card {
  const { sectionsHtml, sections, ...rest } = input;
  const finalSections = sections
    ?? sectionsHtml?.map((html, i) => makeSection({ title: `Cjelina ${i + 1}`, html }))
    ?? [makeSection({ html: "<p>Test content</p>" })];
  return {
    id: rest.id ?? uid("card"),
    question: rest.question ?? "Test question?",
    sections: finalSections,
    categoryId: rest.categoryId ?? "cat_test",
    createdAt: rest.createdAt ?? Date.now(),
    readCount: rest.readCount ?? 0,
    type: rest.type ?? "essay",
    ...rest,
  } as Card;
}

export interface MakeSourceInput extends Partial<Omit<Source, "contentDoc">> {
  html?: string;
}

export function makeSource(input: MakeSourceInput = {}): Source {
  const { html, ...rest } = input;
  const finalHtml = html ?? "<p>Test source</p>";
  return {
    id: rest.id ?? uid("src"),
    categoryId: rest.categoryId ?? "cat_test",
    title: rest.title ?? "Test Source",
    date: rest.date ?? new Date().toISOString(),
    contentDoc: htmlToDoc(finalHtml),
    outline: rest.outline ?? [],
    articles: rest.articles ?? [],
    version: rest.version ?? 1,
    createdAt: rest.createdAt ?? Date.now(),
    updatedAt: rest.updatedAt ?? Date.now(),
    ...rest,
  } as Source;
}

export interface MakeArticleInput extends Partial<Omit<KnowledgeBaseArticle, "contentDoc">> {
  md?: string;
  html?: string;
}

export function makeArticle(input: MakeArticleInput = {}): KnowledgeBaseArticle {
  const { md, html, ...rest } = input;
  const finalHtml = html ?? (md ? mdToHtml(md) : "<p>Test article</p>");
  return {
    id: rest.id ?? uid("art"),
    subjectId: rest.subjectId ?? "cat_test",
    title: rest.title ?? "Test Article",
    contentDoc: htmlToDoc(finalHtml),
    linkedSourceIds: rest.linkedSourceIds ?? [],
    ...rest,
  } as KnowledgeBaseArticle;
}
