/**
 * bulkCreate onSuccess prepends created articles into TanStack cache.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { kbTestDb as db } from "./helpers/kb-test-db";
import { newArticle, saveArticle } from "@/domains/zettelkasten/zettelkasten-storage";
import type { KnowledgeBaseArticle } from "@/domains/zettelkasten/zettelkasten-storage";
import { useKnowledgeBaseMutations } from "@/hooks/zettelkasten/useKnowledgeBaseMutations";
import { queryKeys } from "@/lib/query/keys";

const SUBJECT = "subject-bulk";

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(async () => {
  await db.knowledgeBaseArticles.clear();
});

describe("useKnowledgeBaseMutations.bulkCreate", () => {
  it("prepends created articles into bySubject and all() cache on success", async () => {
    const existing = newArticle(SUBJECT, "Existing");
    await saveArticle(existing);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData<KnowledgeBaseArticle[]>(
      queryKeys.knowledgeBase.bySubject(SUBJECT),
      [existing],
    );
    qc.setQueryData<KnowledgeBaseArticle[]>(
      queryKeys.knowledgeBase.all(),
      [existing],
    );

    const { result } = renderHook(() => useKnowledgeBaseMutations(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.bulkCreate.mutateAsync({
        subjectId: SUBJECT,
        titles: ["Alpha", "Beta"],
      });
    });

    const bySubject = qc.getQueryData<KnowledgeBaseArticle[]>(
      queryKeys.knowledgeBase.bySubject(SUBJECT),
    )!;
    expect(bySubject).toHaveLength(3);
    expect(bySubject.map(a => a.title)).toEqual(["Alpha", "Beta", "Existing"]);

    const all = qc.getQueryData<KnowledgeBaseArticle[]>(
      queryKeys.knowledgeBase.all(),
    )!;
    expect(all).toHaveLength(3);
    expect(all.map(a => a.title)).toEqual(["Alpha", "Beta", "Existing"]);

    for (const title of ["Alpha", "Beta"]) {
      const article = bySubject.find(a => a.title === title)!;
      expect(qc.getQueryData(queryKeys.knowledgeBase.byId(article.id))).toEqual(article);
    }
  });
});
