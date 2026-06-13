/**
 * Regression: AutoSplit dialog must stay in "done" phase after import.
 *
 * Previously the reset effect was keyed on [detected, linkedCards]; the
 * cards-context update from bulkAddCards re-fired the effect and flipped
 * the UI from "done" back to "preview" (importedCount lost).
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { makeSource } from "./factories";

// Mock the heavy context dependencies before importing the hook.
const mockCards: { current: Array<{ id: string; sourceId?: string }> } = { current: [] };
const bulkAddCards = vi.fn((cards: Array<{ id: string; sourceId?: string }>) => {
  mockCards.current = [...mockCards.current, ...cards];
});
const updateCard = vi.fn();

vi.mock("@/hooks/cards/useCardState", () => ({
  useCardData: () => ({ cards: mockCards.current }),
}));
vi.mock("@/hooks/cards/useActions", () => ({
  useCardOnlyActions: () => ({ bulkAddCards, updateCard }),
}));

vi.mock("@/lib/auto-split-engine", () => ({
  detectArticles: (_html: string) => [
    {
      articleNum: "1",
      title: "Prvi",
      essayName: "Čl. 1 — Prvi",
      contentHtml: "<p>x</p>",
      contentText: "x",
      plainSnippet: "x",
    },
  ],
}));

vi.mock("@/lib/services/autoSplitImportService", () => ({
  executeImportPlan: vi.fn(async (plan, deps) => {
    deps.bulkAddCards(plan.toCreate);
    deps.onProgress?.(100);
    return { created: plan.toCreate.length, updated: 0, total: plan.toCreate.length, idbCount: 1 };
  }),
}));

import { useAutoSplitImport } from "@/hooks/useAutoSplitImport";

const fakeSource = makeSource({
  id: "src-1",
  categoryId: "cat-1",
  title: "Test",
  html: "<p>x</p>",
  createdAt: 0,
  updatedAt: 0,
});

describe("useAutoSplitImport — phase persistence", () => {
  it("stays in 'done' after import even when cards context updates", async () => {
    mockCards.current = [];
    const { makeQueryWrapper } = await import("./helpers/queryWrapper");
    const wrapper = makeQueryWrapper();
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useAutoSplitImport(open, fakeSource),
      { initialProps: { open: true }, wrapper },
    );


    expect(result.current.phase).toBe("preview");
    expect(result.current.rows.length).toBe(1);

    await act(async () => { await result.current.startImport(); });

    expect(result.current.phase).toBe("done");
    expect(result.current.importedCount).toBe(1);

    // Force a re-render (mimics React reacting to the cards context change).
    rerender({ open: true });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.phase).toBe("done");
    expect(result.current.importedCount).toBe(1);
  });
});
