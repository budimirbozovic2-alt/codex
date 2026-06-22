import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSourceMapping } from "@/hooks/source-reader/useSourceMapping";
import { useSourceReaderStore } from "@/store";
import { makeSource } from "./factories";
import { htmlToDoc } from "@/lib/editor-v4";
import type { SelectionModule } from "@/lib/selection-split-engine";
import { defaultEdit } from "@/lib/split-wizard-build";
import { makeQueryWrapper } from "./helpers/queryWrapper";
import type { SelectionPayload } from "@/lib/source-reader/selection-payload";

const mockAddCard = vi.fn();
const mockPatchCard = vi.fn();

vi.mock("@/hooks/cards/useActions", () => ({
  useCardOnlyActions: () => ({
    addCard: mockAddCard,
    patchCard: mockPatchCard,
  }),
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
  id: "law-1",
  categoryId: "cat-1",
  title: "Zakon o upravnom postupku",
  sourceKind: "propis",
});

function payload(text: string): SelectionPayload {
  const html = `<p>${text}</p>`;
  return { text, html, contentDoc: htmlToDoc(html) };
}

describe("useSourceMapping — law-path essay wizard", () => {
  const wrapper = makeQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
    useSourceReaderStore.getState().reset();
  });

  it("handleSmartSplitConfirm creates combined essay with chapter metadata", () => {
    const { result } = renderHook(() => useSourceMapping(lawSource), { wrapper });

    act(() => {
      useSourceReaderStore.getState().setSplitResult({
        modules: [MOD],
        rangeLabel: "čl. 59",
        parentName: "čl. 59 Pojam",
      });
      useSourceReaderStore.getState().initSplitWizard([MOD], "čl. 59 Pojam");
      useSourceReaderStore.getState().setWizardSubcategoryId("sub-1");
      useSourceReaderStore.getState().setWizardChapterId("chap-1");
    });

    act(() => {
      result.current.handleSmartSplitConfirm();
    });

    expect(mockAddCard).toHaveBeenCalledTimes(1);
    const [question, sections, categoryId, subId, chapId, options] = mockAddCard.mock.calls[0];
    expect(question).toBe("čl. 59 Pojam");
    expect(categoryId).toBe("cat-1");
    expect(subId).toBe("sub-1");
    expect(chapId).toBe("chap-1");
    expect(sections).toHaveLength(1);
    expect(options?.sourceType).toBe("zakon");
    expect(options?.sourceId).toBe("law-1");
    expect(options?.sourceModules).toHaveLength(1);
  });

  it("handleConvertToEssay runs član-split only for propis sources", () => {
    const { result } = renderHook(() => useSourceMapping(lawSource), { wrapper });
    const text = "Uvod\nČlan 1\nPrvi.\nČlan 2\nDrugi.";

    act(() => {
      result.current.handleConvertToEssay(payload(text));
    });

    const state = useSourceReaderStore.getState();
    expect(state.splitSummaryOpen).toBe(true);
    expect(state.splitModules.length).toBeGreaterThanOrEqual(2);
  });

  it("handleConvertToEssay skips član-split for skripta", () => {
    const scriptSource = makeSource({ ...lawSource, sourceKind: "skripta" });
    const { result } = renderHook(() => useSourceMapping(scriptSource), { wrapper });
    const text = "Uvod\nČlan 1\nPrvi.\nČlan 2\nDrugi.";

    act(() => {
      result.current.handleConvertToEssay(payload(text));
    });

    const state = useSourceReaderStore.getState();
    expect(state.splitSummaryOpen).toBe(true);
    expect(state.splitModules).toHaveLength(1);
    expect(state.splitEdits[0]).toEqual(defaultEdit(state.splitModules[0]));
  });
});