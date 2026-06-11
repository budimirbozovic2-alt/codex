/**
 * Verifies the dirty-check matrix and the "fresh-read before save" behaviour
 * that protects against clobbering concurrent wiki-link auto-create writes.
 *
 * PR-7b: write path is AST-only. Tests construct EditorDoc fixtures and
 * assert against `persisted.contentDoc` (or derived markdown), not legacy
 * `content` string mutation via `updateDraft`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { kbTestDb as db } from "./helpers/kb-test-db";
import { newArticle, saveArticle } from "@/domains/zettelkasten/zettelkasten-storage";
import { useArticleDraft } from "@/hooks/zettelkasten/useArticleDraft";
import { htmlToDoc } from "@/lib/editor-v4";
import { deriveMarkdown } from "@/lib/editor-v4/derived";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: qc }, children);

const SUBJECT = "subject-draft";

beforeEach(async () => {
  await db.knowledgeBaseArticles.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("useArticleDraft", () => {
  it("flush is a no-op when draft equals fresh persisted article", async () => {
    const article = newArticle(SUBJECT, "Alpha");
    article.content = deriveMarkdown(article.contentDoc);
    await saveArticle(article);

    const setArticles = vi.fn();
    const { result } = renderHook(() =>
      useArticleDraft({ activeId: article.id, categoryId: SUBJECT, setArticles }), { wrapper },
    );

    act(() => result.current.enterEdit(article));
    const before = (await db.knowledgeBaseArticles.get(article.id))!;
    await act(async () => { await result.current.flush(); });
    const after = (await db.knowledgeBaseArticles.get(article.id))!;
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(setArticles).not.toHaveBeenCalled();
  });

  it("flush detects dirty title/content/tags/aliases and persists once", async () => {
    const article = newArticle(SUBJECT, "Beta");
    await saveArticle(article);

    const setArticles = vi.fn();
    const { result } = renderHook(() =>
      useArticleDraft({ activeId: article.id, categoryId: SUBJECT, setArticles }), { wrapper },
    );
    act(() => result.current.enterEdit(article));
    act(() => result.current.updateDraft({
      title: "Beta v2",
      tags: ["t1"],
      aliases: ["BETA case"],
    }));
    act(() => result.current.updateDraftDoc(htmlToDoc("<p>new body</p>")));

    await act(async () => { await result.current.flush(); });
    const persisted = (await db.knowledgeBaseArticles.get(article.id))!;
    expect(persisted.title).toBe("Beta v2");
    expect(deriveMarkdown(persisted.contentDoc)).toContain("new body");
    expect(persisted.tags).toEqual(["t1"]);
    expect(persisted.aliases).toEqual(["beta case"]); // normalized lowercase
    expect(setArticles).toHaveBeenCalledTimes(1);
  });

  it("flush merges into FRESH persisted article (concurrent linkedSourceIds preserved)", async () => {
    const article = newArticle(SUBJECT, "Gamma");
    await saveArticle(article);

    const setArticles = vi.fn();
    const { result } = renderHook(() =>
      useArticleDraft({ activeId: article.id, categoryId: SUBJECT, setArticles }), { wrapper },
    );
    act(() => result.current.enterEdit(article));
    act(() => result.current.updateDraftDoc(htmlToDoc("<p>user-typed body</p>")));

    // Simulate a concurrent write that happened mid-edit (e.g. wiki-link auto-create).
    const concurrent = (await db.knowledgeBaseArticles.get(article.id))!;
    await db.knowledgeBaseArticles.put({
      ...concurrent,
      isIndex: true, // any field outside the draft surface
      updatedAt: Date.now(),
    });

    await act(async () => { await result.current.flush(); });
    const persisted = (await db.knowledgeBaseArticles.get(article.id))!;
    expect(deriveMarkdown(persisted.contentDoc)).toContain("user-typed body");
    expect(persisted.isIndex).toBe(true); // concurrent field NOT clobbered
  });
});
