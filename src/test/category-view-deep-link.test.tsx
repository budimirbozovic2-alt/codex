import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import CategoryView from "@/views/CategoryView";
import { SR_OPEN_SOURCE_ID_KEY } from "@/lib/source-reader/pending-source-open";
import { makeRouterWrapper } from "./helpers/routerWrapper";
import { makeQueryWrapper } from "./helpers/queryWrapper";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/hooks/cards/useCardState", () => ({
  useAppDataReady: () => true,
  useCategoryData: () => ({
    categoryRecords: [{ id: "cat-1", name: "Krivično pravo", subcategories: [] }],
  }),
}));

vi.mock("@/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store")>();
  return {
    ...actual,
    useCardsByCategoryWithStatus: () => ({ cards: [], isLoading: false }),
  };
});

const mockRefetch = vi.fn();

vi.mock("@/hooks/useCategorySources", () => ({
  useCategorySourcesWithStatus: vi.fn(() => ({
    sources: [{ id: "src-a", title: "Zakon", categoryId: "cat-1" }],
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
  })),
}));

vi.mock("@/hooks/cards/useActions", () => ({
  useCardOnlyActions: () => ({ bulkFlagNeedsReview: vi.fn() }),
}));

vi.mock("@/components/category/SourcesTab", () => ({
  default: () => <div data-testid="sources-tab" />,
}));

vi.mock("@/components/category/SourcesBreadcrumb", () => ({
  default: () => null,
}));

vi.mock("@/components/SourceReader", () => ({
  default: () => <div data-testid="source-reader" />,
}));

import { toast } from "sonner";
import { useCategorySourcesWithStatus } from "@/hooks/useCategorySources";

const Router = makeRouterWrapper("/category/cat-1");
const Wrapper = makeQueryWrapper();

function renderCategoryView() {
  return render(
    <Wrapper>
      <Router>
        <Routes>
          <Route path="/category/:categoryId" element={<CategoryView />} />
        </Routes>
      </Router>
    </Wrapper>,
  );
}

describe("CategoryView deep-link and errors", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(useCategorySourcesWithStatus).mockReturnValue({
      sources: [{ id: "src-a", title: "Zakon", categoryId: "cat-1" } as never],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
  });

  it("shows toast when pending source id is missing from the category", async () => {
    sessionStorage.setItem(SR_OPEN_SOURCE_ID_KEY, "missing-src");
    renderCategoryView();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Izvor nije pronađen",
        expect.objectContaining({
          description: "Traženi dokument više ne postoji u ovoj kategoriji.",
        }),
      );
    });
  });

  it("renders FetchErrorPanel when sources fail to load", () => {
    vi.mocked(useCategorySourcesWithStatus).mockReturnValue({
      sources: [],
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });

    renderCategoryView();
    expect(screen.getByText("Greška pri učitavanju izvora")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pokušaj ponovo/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
