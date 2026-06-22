/**
 * Integration: SubjectCardsView — passive read + edit-and-return wiring.
 *
 * Exercises the real view composition (CardViewMode → PassiveReader), SQLite
 * card reads via TanStack, edit-return snapshot stash/consume, and navigation
 * to /edit — without mounting the full app shell.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import { INTEGRATION_TEST_TIMEOUT_MS } from "./helpers/test-timeouts";

vi.mock("@/hooks/cards/useCardState", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/hooks/cards/useCardState")>();
  return { ...orig, useAppDataReady: () => true };
});

vi.mock("@/hooks/cards/useActions", () => ({
  useCardOnlyActions: () => ({
    addCard: vi.fn(),
    addFlashCard: vi.fn(),
    bulkAddFlashCards: vi.fn(),
    patchCard: vi.fn(),
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

import { uiStore } from "@/store/useUIStore";
import {
  TEST_CARD_A_ID,
  TEST_CATEGORY_ID,
  resetSubjectCardsHarness,
  seedSubjectCardsFixture,
} from "./helpers/subjectCardsHarness";
import { renderSubjectCardsView } from "./helpers/renderSubjectCardsView";

const SUBJECT_PATH = `/subject/${TEST_CATEGORY_ID}/cards`;
const STATE_KEY = "sr-edit-return-context:state";

function readEditSnapshot(): Record<string, unknown> | null {
  const raw = sessionStorage.getItem(STATE_KEY);
  if (!raw) return null;
  return (JSON.parse(raw) as { data: Record<string, unknown> }).data ?? null;
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

function clickEditOnCard(question: string) {
  fireEvent.click(
    within(cardRowInManage(question)).getByRole("button", { name: "Uredi karticu" }),
  );
}

function clickPassiveReadOnCard(question: string) {
  fireEvent.click(
    within(cardRowInManage(question)).getByRole("button", {
      name: "Pasivno čitanje ove kartice",
    }),
  );
}

describe("SubjectCardsView integration", { timeout: INTEGRATION_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    resetSubjectCardsHarness(SUBJECT_PATH);
    await seedSubjectCardsFixture();
  });

  it("opens passive reader on the selected card from manage view", async () => {
    renderSubjectCardsView();

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
  });

  it("navigates to /edit and stashes snapshot when editing from manage view", async () => {
    renderSubjectCardsView();

    await waitForManageCards();
    clickEditOnCard("Pitanje A");

    await waitFor(() => {
      expect(screen.getByTestId("edit-page")).toBeInTheDocument();
    });

    expect(uiStore.getState().editingCardId).toBe(TEST_CARD_A_ID);

    const snap = readEditSnapshot();
    expect(snap?.path).toBe(SUBJECT_PATH);
    expect(snap?.categoryId).toBe(TEST_CATEGORY_ID);
    expect(snap?.cardId).toBe(TEST_CARD_A_ID);
    expect(snap?.tab).toBe("manage");
  });

  it("stashes read-tab context when editing from passive reader", async () => {
    renderSubjectCardsView();

    await waitForManageCards();
    clickPassiveReadOnCard("Pitanje A");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Pitanje A" })).toBeInTheDocument();
    });

    const readPanel = activeTabPanel();
    fireEvent.click(
      within(readPanel).getByRole("button", { name: "Uredi karticu" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("edit-page")).toBeInTheDocument();
    });

    const snap = readEditSnapshot();
    expect(snap?.tab).toBe("read");
    expect(snap?.readerCardId).toBe(TEST_CARD_A_ID);
    expect(snap?.cardId).toBe(TEST_CARD_A_ID);
  });

  it("restores passive-read tab and card after edit-return snapshot", async () => {
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        data: {
          path: SUBJECT_PATH,
          categoryId: TEST_CATEGORY_ID,
          cardId: TEST_CARD_A_ID,
          tab: "read",
          readerCardId: TEST_CARD_A_ID,
          manageMode: "edit",
        },
        ts: Date.now(),
      }),
    );

    renderSubjectCardsView();

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: /Pasivno čitanje/i }),
      ).toHaveAttribute("data-state", "active");
    });

    const readPanel = screen.getByRole("tabpanel");
    await waitFor(() => {
      expect(
        within(readPanel).getByRole("heading", { level: 2, name: "Pitanje A" }),
      ).toBeInTheDocument();
    });

    expect(sessionStorage.getItem(STATE_KEY)).toBeNull();
  });

  it("passive reader pager moves to the next card", async () => {
    renderSubjectCardsView();

    await waitForManageCards();
    clickPassiveReadOnCard("Pitanje A");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Pitanje A" })).toBeInTheDocument();
    });

    const readPanel = activeTabPanel();
    fireEvent.click(within(readPanel).getByRole("button", { name: /Sljedeća/i }));

    await waitFor(() => {
      expect(
        within(readPanel).getByRole("heading", { level: 2, name: "Pitanje B" }),
      ).toBeInTheDocument();
    });
  });
});