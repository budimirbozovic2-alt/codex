/**
 * Integration: kritični UX tokovi za SubjectCardsView (lista, pasivno čitanje, uređivanje).
 *
 * SQLite ide kroz globalni sqlite-harness (src/test/setup.ts + src/test/sqlite-harness.ts).
 * TanStack Query + cardRepository čitaju stvarne mock kartice iz in-memory baze.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within, fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import SubjectCardsView from "@/views/SubjectCardsView";
import { getCardsByIds } from "@/lib/db/queries/cards";
import { uiStore } from "@/store/useUIStore";
import {
  TEST_CARD_A_ID,
  TEST_CATEGORY_ID,
  resetSubjectCardsHarness,
  seedSubjectCardsFixture,
} from "../helpers/subjectCardsHarness";

const mockPatchCard = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/cards/useCardState", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/hooks/cards/useCardState")>();
  return { ...orig, useCardReady: () => true };
});

vi.mock("@/hooks/cards/useActions", () => ({
  useCardOnlyActions: () => ({
    addCard: vi.fn(),
    addFlashCard: vi.fn(),
    bulkAddFlashCards: vi.fn(),
    patchCard: mockPatchCard,
    setFrequency: vi.fn(),
    deleteCard: vi.fn(),
    reviewSection: vi.fn(),
    markRead: vi.fn(),
    toggleTag: vi.fn(),
    logError: vi.fn(),
    clearErrorLog: vi.fn(),
    addKeyPart: vi.fn(),
    bulkFlagNeedsReview: vi.fn(),
    bulkUpdateChapter: vi.fn(),
  }),
  useCategoryActions: () => ({
    addSubcategory: vi.fn(),
    renameSubcategory: vi.fn(),
    deleteSubcategory: vi.fn(),
    addChapter: vi.fn(),
    renameChapter: vi.fn(),
    deleteChapter: vi.fn(),
    reorderSubcategories: vi.fn(),
    reorderChapters: vi.fn(),
    bulkUpdateSubcategory: vi.fn(),
    reorderCategories: vi.fn(),
    updateExaminerProfile: vi.fn(),
  }),
  useBackupActions: () => ({
    importCards: vi.fn(),
    exportData: vi.fn(),
    exportTemplate: vi.fn(),
    importData: vi.fn(),
  }),
}));

vi.mock("@/components/ui/ContentRenderer", () => ({
  ContentRenderer: ({ doc }: { doc?: unknown }) => (
    <div data-testid="content-renderer">{doc ? "content" : "empty"}</div>
  ),
}));

vi.mock("@/components/subject-cards/passive-reader/PassiveReaderCard", () => ({
  PassiveReaderCard: ({ card }: { card: { question: string } }) => (
    <article data-testid="passive-reader-card">
      <h2>{card.question}</h2>
    </article>
  ),
}));

const SUBJECT_PATH = `/subject/${TEST_CATEGORY_ID}/cards`;

function MockEditPage() {
  const editingCardId = uiStore((s) => s.editingCardId);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    if (!editingCardId) return;
    void getCardsByIds([editingCardId]).then((cards) => {
      const card = cards[0];
      if (card) setQuestion(card.question);
    });
  }, [editingCardId]);

  return (
    <div data-testid="edit-page">
      <label htmlFor="edit-question">Pitanje</label>
      <input
        id="edit-question"
        aria-label="Pitanje"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          if (editingCardId) {
            mockPatchCard(editingCardId, { question });
          }
        }}
      >
        Sačuvaj
      </button>
    </div>
  );
}

function renderSubjectCardsFlow(path = SUBJECT_PATH) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  window.history.replaceState({}, "", path);

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/subject/:categoryId/cards" element={<SubjectCardsView />} />
            <Route path="/edit" element={<MockEditPage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

async function waitForManageCards() {
  await waitFor(() => {
    expect(screen.getByText("Pitanje A")).toBeInTheDocument();
    expect(screen.getByText("Pitanje B")).toBeInTheDocument();
  });
}

function activeTabPanel(): HTMLElement {
  const panel = screen
    .getAllByRole("tabpanel", { hidden: true })
    .find((p) => p.getAttribute("data-state") === "active");
  if (!panel) throw new Error("No active tabpanel");
  return panel;
}

function cardRowInManage(question: string): HTMLElement {
  const panel = activeTabPanel();
  const label = within(panel).getByText(question);
  const row = label.closest(".rounded-lg.border");
  if (!row) throw new Error(`Card row not found for ${question}`);
  return row as HTMLElement;
}

function clickPassiveReadOnCard(question: string) {
  fireEvent.click(
    within(cardRowInManage(question)).getByRole("button", {
      name: "Pasivno čitanje ove kartice",
    }),
  );
}

function clickEditOnCard(question: string) {
  fireEvent.click(
    within(cardRowInManage(question)).getByRole("button", { name: "Uredi karticu" }),
  );
}

describe("SubjectCardsView critical UX flow", () => {
  beforeEach(async () => {
    mockPatchCard.mockClear();
    resetSubjectCardsHarness(SUBJECT_PATH);
    await seedSubjectCardsFixture();
  });

  it("renders SubjectCardsView and lists seeded cards", async () => {
    renderSubjectCardsFlow();

    await waitForManageCards();

    expect(screen.getByRole("heading", { name: "Testni predmet" })).toBeInTheDocument();
    expect(screen.getByText("Pitanje A")).toBeInTheDocument();
    expect(screen.getByText("Pitanje B")).toBeInTheDocument();
  });

  it("opens passive read mode and shows the selected card content", async () => {
    renderSubjectCardsFlow();

    await waitForManageCards();
    clickPassiveReadOnCard("Pitanje A");

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: /Pasivno čitanje/i }),
      ).toHaveAttribute("data-state", "active");
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Pitanje A" })).toBeInTheDocument();
    });

    expect(screen.queryByText(/greška|error/i)).not.toBeInTheDocument();
  });

  it("opens the editor, changes the question, and triggers save", async () => {
    renderSubjectCardsFlow();

    await waitForManageCards();
    clickEditOnCard("Pitanje A");

    await waitFor(() => {
      expect(screen.getByTestId("edit-page")).toBeInTheDocument();
    });

    expect(uiStore.getState().editingCardId).toBe(TEST_CARD_A_ID);

    const input = await screen.findByRole("textbox", { name: "Pitanje" });
    await waitFor(() => {
      expect(input).toHaveValue("Pitanje A");
    });

    fireEvent.change(input, { target: { value: "Pitanje A (uređeno)" } });
    fireEvent.click(screen.getByRole("button", { name: "Sačuvaj" }));

    expect(mockPatchCard).toHaveBeenCalledTimes(1);
    expect(mockPatchCard).toHaveBeenCalledWith(
      TEST_CARD_A_ID,
      expect.objectContaining({ question: "Pitanje A (uređeno)" }),
    );
  });
});
