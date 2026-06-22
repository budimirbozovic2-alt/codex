import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCategoryStatsData } from "@/hooks/cards/useCardState";
import { makeQueryWrapper } from "@/test/helpers/queryWrapper";

const useCardCountsByCategoryMap = vi.fn(() => ({}));
const useCategoryMasteryScores = vi.fn(() => ({}));

vi.mock("@/hooks/cards/useCategoryState", () => ({
  useCategoryData: () => ({
    categories: ["Predmet A", "Predmet B"],
    categoryRecords: [],
    subcategories: {},
  }),
}));

vi.mock("@/hooks/card/useCardsQuery", () => ({
  useAllCards: () => [],
  useDueCards: () => [],
  useCardCountsByCategoryMap: (...args: unknown[]) => useCardCountsByCategoryMap(...args),
  useCategoryMasteryScores: (...args: unknown[]) => useCategoryMasteryScores(...args),
}));

vi.mock("@/hooks/review/useReviewSettingsQuery", () => ({
  useSrSettings: () => ({}),
}));

describe("useCategoryStatsData lazy loading", () => {
  it("passes enabled:false to batched category SQL hooks", () => {
    renderHook(() => useCategoryStatsData({ enabled: false }), {
      wrapper: makeQueryWrapper(),
    });

    expect(useCardCountsByCategoryMap).toHaveBeenCalledWith(
      ["Predmet A", "Predmet B"],
      { enabled: false },
    );
    expect(useCategoryMasteryScores).toHaveBeenCalledWith(
      ["Predmet A", "Predmet B"],
      { enabled: false },
    );
  });
});
