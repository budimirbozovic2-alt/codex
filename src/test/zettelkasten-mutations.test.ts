/**
 * In-flight dedupe of parallel wiki-link clicks on the same placeholder title.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { db } from "@/lib/db";
import { loadArticlesBySubject } from "@/lib/zettelkasten-storage";
import { useArticleMutations } from "@/hooks/zettelkasten/useArticleMutations";
import type { ArticleDraftApi } from "@/hooks/zettelkasten/useArticleDraft";

const SUBJECT = "subject-mut";

function makeDraftApi(): ArticleDraftApi {
  return {
    draft: null,
    isEditing: false,
    editorRef: { current: null },
    enterEdit: vi.fn(),
    exitEdit: vi.fn(),
    updateDraft: vi.fn(),
    flush: vi.fn().mockResolvedValue(null),
    saveAndClose: vi.fn().mockResolvedValue(undefined),
    resetForArticle: vi.fn(),
  };
}

beforeEach(async () => {
  await db.knowledgeBaseArticles.clear();
});

describe("useArticleMutations.wikiLink", () => {
  it("parallel clicks on same title result in exactly one created article", async () => {
    const setArticles = vi.fn();
    const setActiveId = vi.fn();
    const setReadingSourceId = vi.fn();
    const draftApi = makeDraftApi();

    const { result } = renderHook(() =>
      useArticleMutations({
        categoryId: SUBJECT,
        articles: [],
        setArticles,
        setActiveId,
        setReadingSourceId,
        indexArticleId: null,
        activeArticle: null,
        draftApi,
      }),
    );

    await act(async () => {
      await Promise.all([
        result.current.wikiLink("New Topic"),
        result.current.wikiLink("new topic"),
        result.current.wikiLink("  NEW topic  "),
      ]);
    });

    const all = await loadArticlesBySubject(SUBJECT);
    expect(all).toHaveLength(1);
    expect(all[0].title.toLowerCase()).toBe("new topic");
    expect(draftApi.flush).toHaveBeenCalled();
  });
});
