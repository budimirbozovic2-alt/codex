/**
 * PR-6 — Zettelkasten + Smart-Split write paths emit canonical `contentDoc`.
 *
 * Covers two SSOT guarantees:
 *  1. `useArticleDraft` seeds `Draft.contentDoc` from a legacy markdown-only
 *     article and persists it on flush alongside derived markdown.
 *  2. Smart-Split builders attach `contentDoc` to each section payload so
 *     freshly created cards don't have to wait for lazy-migrate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getKnowledgeBaseArticle } from "@/lib/db/queries";
import { newArticle, saveArticle } from "@/lib/zettelkasten-storage";
import { useArticleDraft } from "@/hooks/zettelkasten/useArticleDraft";
import {
  buildSeparateEssaysFromModules,
  buildCombinedEssayFromModules,
} from "@/lib/source-reader/build-essay-payload";
import { defaultEdit } from "@/lib/split-wizard-build";
import type { SelectionModule } from "@/lib/selection-split-engine";
import type { Source } from "@/lib/db-schema";

const SUBJECT = "subject-pr6";

const MODS: SelectionModule[] = [
  { articleNum: "1", title: "Član 1", contentText: "alpha", contentHtml: "<p>alpha</p>", plainSnippet: "Član 1\nalpha" },
  { articleNum: "2", title: "Član 2", contentText: "beta",  contentHtml: "<p>beta</p>",  plainSnippet: "Član 2\nbeta"  },
];

const SOURCE = {
  id: "src-1", categoryId: "cat-1", title: "Zakon", date: "2024-01-01",
  htmlContent: "<p>x</p>", outline: [], articles: [], version: 1,
  createdAt: 0, updatedAt: 0,
} as unknown as Source;

beforeEach(async () => {
  await db.knowledgeBaseArticles.clear();
  vi.restoreAllMocks();
});

describe("useArticleDraft — contentDoc seed + flush", () => {
  it("seeds Draft.contentDoc from a legacy markdown-only article and persists it on flush", async () => {
    const article = newArticle(SUBJECT, "Legacy");
    article.content = "# Naslov\n\nTekst sa [[Drugi članak]] linkom.";
    await saveArticle(article);

    const setArticles = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() =>
      useArticleDraft({ activeId: article.id, categoryId: SUBJECT, setArticles }),
      { wrapper },
    );

    act(() => result.current.enterEdit(article));
    expect(result.current.draft?.contentDoc.version).toBe(4);
    expect(result.current.draft?.contentDoc.content?.type).toBe("doc");

    // Doc update via updateDraftDoc — PR-7b keeps `contentDoc` as SSOT; markdown
    // is derived only at flush, NOT per keystroke.
    const nextDoc = {
      version: 4 as const,
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "novi sadrzaj" }] }],
      },
    };
    act(() => result.current.updateDraftDoc(nextDoc));
    expect(result.current.draft?.contentDoc).toEqual(nextDoc);

    await act(async () => { await result.current.flush(); });
    const persisted = (await db.knowledgeBaseArticles.get(article.id))!;
    expect(persisted.contentDoc?.version).toBe(4);
    expect(persisted.content).toContain("novi sadrzaj");
  });
});

describe("Smart-Split — sections carry contentDoc", () => {
  it("buildSeparateEssaysFromModules emits contentDoc per section", () => {
    const edits = MODS.map(defaultEdit);
    const args = buildSeparateEssaysFromModules(MODS, edits, SOURCE);
    expect(args).toHaveLength(2);
    for (const a of args) {
      expect(a.sections[0].contentDoc?.version).toBe(4);
      expect(a.sections[0].contentDoc).toBeTruthy();
    }
  });

  it("buildCombinedEssayFromModules emits contentDoc per section", () => {
    const edits = MODS.map(defaultEdit);
    const arg = buildCombinedEssayFromModules(MODS, edits, "Spojeno", SOURCE);
    expect(arg).not.toBeNull();
    expect(arg!.sections).toHaveLength(2);
    for (const s of arg!.sections) {
      expect(s.contentDoc?.version).toBe(4);
    }
  });
});
