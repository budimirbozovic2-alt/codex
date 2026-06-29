import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import ReviewSession from "@/components/ReviewSession";
import LearnSession from "@/components/LearnSession";
import { uiStore } from "@/store/useUIStore";
import { makeCard } from "./factories";

vi.mock("@/components/review/ReviewSetup", () => ({
  default: () => <div data-testid="review-setup" />,
}));

vi.mock("@/components/review/ReviewCard", () => ({
  default: () => <div data-testid="review-card" />,
}));

vi.mock("@/components/review/ReviewComplete", () => ({
  default: () => <div data-testid="review-complete" />,
}));

vi.mock("@/components/learn/FilterSetup", () => ({
  default: ({ onStart }: { onStart: () => void }) => (
    <button type="button" onClick={onStart}>Start</button>
  ),
}));

vi.mock("@/components/learn/SessionComplete", () => ({
  default: () => null,
}));

vi.mock("@/components/EmptyState", () => ({
  default: () => null,
}));

vi.mock("@/components/learn/StudyModeRecall", () => ({
  default: () => <div data-testid="study-recall" />,
}));

vi.mock("@/hooks/planner/useSessionDiscipline", () => ({
  useSessionDiscipline: () => ({
    trackSection: vi.fn(),
    resetSession: vi.fn(),
    recordAfterSession: vi.fn(),
  }),
}));

vi.mock("@/domains/review/review-session-storage", () => ({
  loadSavedReviewSession: vi.fn(async () => null),
  saveReviewSession: vi.fn(),
  clearSavedReviewSession: vi.fn(),
}));

vi.mock("@/lib/db/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/queries")>();
  return {
    ...actual,
    loadAllLearnProgress: vi.fn(async () => ({})),
    replaceAllLearnProgress: vi.fn(async () => {}),
  };
});

const reviewProps = {
  dueCards: [makeCard()],
  allCards: [makeCard()],
  categoryRecords: [{ id: "cat_test", name: "Test", subcategories: [] }],
  srSettings: {
    requestRetention: 0.9,
    maximumInterval: 365,
    enableFuzz: false,
    enableShortTerm: true,
  },
  reviewLog: [],
  onReviewSection: vi.fn(),
  onLogError: vi.fn(),
  onBack: vi.fn(),
};

const learnProps = {
  cards: [makeCard()],
  categories: ["cat_test"],
  categoryRecords: [{ id: "cat_test", name: "Test", subcategories: [] }],
  subcategories: {},
  onMarkRead: vi.fn(),
  onReviewSection: vi.fn(),
  onBack: vi.fn(),
  onEdit: vi.fn(),
  onAddKeyPart: vi.fn(),
};

describe("immersive mode lifecycle", () => {
  beforeEach(() => {
    uiStore.setState({ immersiveMode: false, titleBarContext: null, editingCardId: null });
  });

  it("ReviewSession enables immersive mode for active sessions and clears on unmount", async () => {
    const { unmount } = render(
      <ReviewSession {...reviewProps} autoMode="stabilization" />,
    );

    await waitFor(() => {
      expect(uiStore.getState().immersiveMode).toBe(true);
    });

    unmount();
    expect(uiStore.getState().immersiveMode).toBe(false);
  });

  it("LearnSession enables immersive mode when started and clears on unmount", async () => {
    const { unmount } = render(
      <LearnSession
        {...learnProps}
        initialFilters={{ mode: "strict-recall", categoryId: "cat_test" }}
      />,
    );

    await waitFor(() => {
      expect(uiStore.getState().immersiveMode).toBe(true);
    });

    unmount();
    expect(uiStore.getState().immersiveMode).toBe(false);
  });
});
