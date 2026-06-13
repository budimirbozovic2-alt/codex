/**
 * Regression: cleanup-flush must save the OLD article when activeId changes.
 *
 * PR-7b: write path is AST-only — uses `updateDraftDoc` + EditorDoc fixture.
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

const SUBJECT = "subject-nav";

beforeEach(async () => { await db.knowledgeBaseArticles.clear(); });
afterEach(() => vi.restoreAllMocks());

describe("useArticleDraft — save-on-navigate", () => {
  it("flushes A's edits when activeId changes from A to B", async () => {
    const a = newArticle(SUBJECT, "Alpha");
    const b = newArticle(SUBJECT, "Beta");
    await saveArticle(a);
    await saveArticle(b);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useArticleDraft({ activeId: id, categoryId: SUBJECT }),
      { initialProps: { id: a.id }, wrapper },
    );

    act(() => result.current.enterEdit(a));
    act(() => result.current.updateDraftDoc(htmlToDoc("<p>edits in A</p>")));

    await act(async () => { rerender({ id: b.id }); });
    await act(async () => { await Promise.resolve(); });

    const persistedA = (await db.knowledgeBaseArticles.get(a.id))!;
    expect(deriveMarkdown(persistedA.contentDoc)).toContain("edits in A");
  });
});
