import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ReviewCard from "@/components/review/ReviewCard";
import { makeCard, makeSection } from "./factories";

let capturedChrome: {
  progressLabel: string;
  progressCurrent: number;
  progressTotal: number;
  scopeBadge?: React.ReactNode;
} | null = null;

vi.mock("@/components/SessionChrome", () => ({
  SessionChrome: (props: {
    progressLabel: string;
    progressCurrent: number;
    progressTotal: number;
    scopeBadge?: React.ReactNode;
  }) => {
    capturedChrome = props;
    return <div data-testid="session-chrome-mock">{props.progressLabel}</div>;
  },
}));

vi.mock("@/hooks/cards/useCategoryState", () => ({
  useCategoryData: () => ({
    categoryRecords: [{ id: "cat_test", name: "Krivično pravo", subcategories: [] }],
  }),
}));

vi.mock("@/hooks/useGlobalHotkey", () => ({
  useGlobalHotkey: vi.fn(),
}));

vi.mock("@/lib/editor-v4/EditorView", () => ({
  EditorView: () => <div data-testid="editor-view" />,
}));

const baseProps = {
  showAnswer: false,
  setShowAnswer: vi.fn(),
  onGrade: vi.fn(),
  onLogError: vi.fn(),
  onBack: vi.fn(),
  srSettings: {
    requestRetention: 0.9,
    maximumInterval: 365,
    enableFuzz: false,
    enableShortTerm: true,
  },
  viewWidth: "normal" as const,
  onViewWidthChange: vi.fn(),
};

describe("ReviewCard progress wiring", () => {
  beforeEach(() => {
    capturedChrome = null;
  });

  it("passes 1-based progress values to SessionChrome", () => {
    render(
      <ReviewCard
        {...baseProps}
        card={makeCard()}
        section={makeSection()}
        progress={2}
        total={5}
        sectionIndex={0}
        totalSectionsInCard={1}
      />,
    );

    expect(capturedChrome?.progressCurrent).toBe(3);
    expect(capturedChrome?.progressTotal).toBe(5);
    expect(screen.getByTestId("session-chrome-mock")).toHaveTextContent("3 / 5");
  });

  it("shows multi-section indicator and locked category badge", () => {
    const card = makeCard({
      sections: [
        makeSection({ title: "Prva" }),
        makeSection({ title: "Druga" }),
        makeSection({ title: "Treća" }),
      ],
    });

    render(
      <ReviewCard
        {...baseProps}
        card={card}
        section={card.sections[1]!}
        progress={0}
        total={3}
        sectionIndex={1}
        totalSectionsInCard={3}
        lockedCategoryName="Krivično pravo"
      />,
    );

    expect(screen.getByText("(2/3)")).toBeInTheDocument();
    expect(capturedChrome?.scopeBadge).toBeTruthy();
  });
});
