import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import MainLayout from "@/components/MainLayout";
import { uiStore } from "@/store/useUIStore";
import { makeQueryWrapper } from "./helpers/queryWrapper";

vi.mock("@/components/AppSidebar", () => ({
  default: () => <div data-testid="app-sidebar">Sidebar</div>,
}));

vi.mock("@/components/Breadcrumbs", () => ({
  default: () => <div data-testid="breadcrumbs">Crumbs</div>,
}));

vi.mock("@/components/ZenMode", () => ({
  default: () => null,
}));

vi.mock("@/components/db/BlockingModal", () => ({
  default: () => null,
}));

vi.mock("@/features/docx-importer", () => ({
  DocxImporter: () => null,
}));

vi.mock("@/components/GlobalSearch", () => ({
  default: () => null,
}));

vi.mock("@/components/OnboardingModal", () => ({
  default: () => null,
  hasSeenOnboarding: () => true,
}));

vi.mock("@/hooks/cards/useActions", () => ({
  useBackupActions: () => ({ exportData: vi.fn(), importData: vi.fn(), exportTemplate: vi.fn() }),
  useCardOnlyActions: () => ({ addFlashCard: vi.fn(), importCards: vi.fn() }),
}));

vi.mock("@/hooks/cards/useCategoryState", () => ({
  useCategoryData: () => ({ categoryRecords: [] }),
}));

vi.mock("@/hooks/cards/useCardState", () => ({
  useReviewData: () => ({ reviewLog: [] }),
}));

vi.mock("@/hooks/useUI", () => ({
  useUIContext: () => ({ editingCardId: null, setEditingCardId: vi.fn() }),
}));

vi.mock("@/hooks/useEditReturn", () => ({
  useEditReturn: () => ({ stashEditReturn: vi.fn() }),
}));

vi.mock("@/hooks/useBeforeUnloadGuard", () => ({
  useBeforeUnloadGuard: vi.fn(),
}));

vi.mock("@/hooks/useGlobalHotkey", () => ({
  useGlobalHotkey: vi.fn(),
}));

vi.mock("@/lib/drafts", () => ({
  recoverDraftsOnBoot: vi.fn(async () => undefined),
}));

const QueryWrapper = makeQueryWrapper();

function renderLayout(path = "/") {
  return render(
    <QueryWrapper>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={
              <MainLayout>
                <div data-testid="page-body">Body</div>
              </MainLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryWrapper>,
  );
}

describe("MainLayout immersive mode", () => {
  beforeEach(() => {
    uiStore.setState({ immersiveMode: false, titleBarContext: null, editingCardId: null });
  });

  it("shows sidebar and header when immersive mode is off", () => {
    renderLayout("/learn");
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByLabelText("Pretraži (Ctrl+K)")).toBeInTheDocument();
    expect(screen.getByTestId("page-body").closest("main")).toHaveClass("max-w-6xl");
  });

  it("hides sidebar and header when immersive mode is on", () => {
    uiStore.setState({ immersiveMode: true });
    renderLayout("/category/cat-1");
    expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pretraži (Ctrl+K)")).not.toBeInTheDocument();
    expect(screen.getByTestId("page-body").closest("main")).toHaveClass("max-w-none");
  });
});
