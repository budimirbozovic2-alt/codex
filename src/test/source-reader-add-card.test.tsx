/**
 * Source Reader → addCard → SQLite (end-to-end hook path).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSourceMapping } from "@/hooks/source-reader/useSourceMapping";
import { useSourceReaderStore } from "@/store";
import { makeQueryWrapper } from "@/test/helpers/queryWrapper";
import { listAllCards } from "@/lib/db/queries";
import { makeSource } from "@/test/factories";
import { htmlToDoc } from "@/lib/editor-v4";
import type { SelectionModule } from "@/lib/selection-split-engine";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/services/sourceEditingService", () => ({
  commitMappingCreated: vi.fn(),
}));

const MOD: SelectionModule = {
  id: "mod-1",
  articleNum: "59",
  title: "čl. 59 Pojam",
  contentText: "Tekst člana.",
  contentHtml: "<p>Tekst člana.</p>",
  plainSnippet: "Član 59\nTekst člana.",
};

const lawSource = makeSource({
  id: "law-src-1",
  categoryId: "cat-source-reader",
  title: "Zakon o upravnom postupku",
  sourceKind: "propis",
});

describe("Source Reader add card persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSourceReaderStore.getState().reset();
  });

  it("handleSmartSplitConfirm persists combined essay with source metadata", async () => {
    const wrapper = makeQueryWrapper();
    const { result } = renderHook(() => useSourceMapping(lawSource), { wrapper });

    act(() => {
      useSourceReaderStore.getState().setSplitResult({
        modules: [MOD],
        rangeLabel: "čl. 59",
        parentName: "čl. 59 Pojam",
      });
      useSourceReaderStore.getState().initSplitWizard([MOD], "čl. 59 Pojam");
      useSourceReaderStore.getState().setWizardSubcategoryId("sub-sr");
      useSourceReaderStore.getState().setWizardChapterId("chap-sr");
    });

    act(() => {
      result.current.handleSmartSplitConfirm();
    });

    await waitFor(async () => {
      const cards = await listAllCards();
      const saved = cards.find(
        (c) => c.question === "čl. 59 Pojam" && c.categoryId === "cat-source-reader",
      );
      expect(saved).toBeDefined();
      expect(saved?.sourceId).toBe("law-src-1");
      expect(saved?.sourceType).toBe("zakon");
      expect(saved?.subcategoryId).toBe("sub-sr");
      expect(saved?.chapterId).toBe("chap-sr");
      expect(saved?.sourceModules).toHaveLength(1);
      expect(saved?.sections).toHaveLength(1);
    });
  });

  it("handleMapSelection preserves list formatting via contentDoc", async () => {
    const wrapper = makeQueryWrapper();
    const scriptSource = makeSource({
      id: "script-src-1",
      categoryId: "cat-source-reader",
      title: "Skripta",
      sourceKind: "skripta",
    });
    const { result } = renderHook(() => useSourceMapping(scriptSource), { wrapper });

    const questionId = "eq-list";
    const listHtml = "<ul><li>Prva stavka</li><li>Druga stavka</li></ul>";
    const contentDoc = htmlToDoc(listHtml);

    act(() => {
      useSourceReaderStore.getState().setExamQuestions([
        { id: questionId, text: "Navedite stavke?", done: false },
      ]);
    });

    act(() => {
      result.current.handleMapSelection(questionId, {
        text: "Prva stavka Druga stavka",
        html: listHtml,
        contentDoc,
      });
    });

    await waitFor(async () => {
      const cards = await listAllCards();
      const saved = cards.find((c) => c.question === "Navedite stavke?");
      expect(saved).toBeDefined();
      const section = saved?.sections[0];
      expect(section?.contentDoc).toBeDefined();
      const json = JSON.stringify(section?.contentDoc);
      expect(json).toContain("bulletList");
    });
  });

  it("handleMapSelection persists exam-mapped essay", async () => {
    const wrapper = makeQueryWrapper();
    const { result } = renderHook(() => useSourceMapping(lawSource), { wrapper });

    const questionId = "eq-1";
    act(() => {
      useSourceReaderStore.getState().setExamQuestions([
        { id: questionId, text: "Objasnite pojam upravnog postupka?", done: false },
      ]);
    });

    act(() => {
      result.current.handleMapSelection(questionId, {
        text: "Kratak odgovor bez članova.",
        html: "<p>Kratak odgovor bez članova.</p>",
        contentDoc: htmlToDoc("<p>Kratak odgovor bez članova.</p>"),
      });
    });

    await waitFor(async () => {
      const cards = await listAllCards();
      const saved = cards.find((c) => c.question === "Objasnite pojam upravnog postupka?");
      expect(saved).toBeDefined();
      expect(saved?.sourceId).toBe("law-src-1");
      expect(saved?.categoryId).toBe("cat-source-reader");
      expect(saved?.sections).toHaveLength(1);
    });

    expect(useSourceReaderStore.getState().examQuestions[0]?.done).toBe(true);
  });

  it("handleMapSelection splits propis selection into multiple sections", async () => {
    const wrapper = makeQueryWrapper();
    const { result } = renderHook(() => useSourceMapping(lawSource), { wrapper });

    const questionId = "eq-2";
    const selection =
      "Naslov 1\nČlan 1\nSadržaj jedan.\nNaslov 2\nČlan 2\nSadržaj dva.";

    act(() => {
      useSourceReaderStore.getState().setExamQuestions([
        { id: questionId, text: "Pitanje o članovima?", done: false },
      ]);
    });

    act(() => {
      result.current.handleMapSelection(questionId, {
        text: selection,
        html: `<p>${selection}</p>`,
        contentDoc: htmlToDoc(`<p>${selection}</p>`),
      });
    });

    await waitFor(async () => {
      const cards = await listAllCards();
      const saved = cards.find((c) => c.question === "Pitanje o članovima?");
      expect(saved).toBeDefined();
      expect((saved?.sections.length ?? 0)).toBeGreaterThanOrEqual(2);
      expect(saved?.sourceModules?.length).toBeGreaterThanOrEqual(2);
    });
  });
});
