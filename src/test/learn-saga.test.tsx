import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SagaSatelliteSidebar from "@/components/learn/SagaSatelliteSidebar";
import ParentEssayScaffold from "@/components/learn/ParentEssayScaffold";
import StudyModeRecall from "@/components/learn/StudyModeRecall";
import { makeCard } from "@/test/factories";

vi.mock("@/components/card-list/CardSelectionEditor", () => ({
  CardSelectionEditor: () => <div data-testid="section-editor" />,
}));

vi.mock("@/lib/scheduler", () => ({
  taskScheduler: {
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
  },
}));

vi.mock("@/hooks/useGlobalHotkey", () => ({
  useGlobalHotkey: () => {},
}));

vi.mock("@/components/learn/SessionHeader", () => ({
  default: () => <div data-testid="session-header" />,
}));

vi.mock("@/components/learn/QuestionDots", () => ({
  default: () => null,
}));

vi.mock("@/components/learn/NavigationButtons", () => ({
  default: () => null,
}));

const sortedCardsProps = {
  sortedCards: [] as ReturnType<typeof makeCard>[],
  currentIndex: 0,
  viewWidth: "normal" as const,
  setViewWidth: vi.fn(),
  readCards: new Set<string>(),
  completedCards: new Set<string>(),
  chainCompletedCards: new Set<string>(),
  onMarkRead: vi.fn(),
  onReviewSection: vi.fn(),
  onAddKeyPart: vi.fn(),
  goToCard: vi.fn(),
  goNext: vi.fn(),
  goPrev: vi.fn(),
  onBack: vi.fn(),
  setCompletedCards: vi.fn(),
  setTotalGrades: vi.fn(),
  setModulesCompleted: vi.fn(),
  updateProgress: vi.fn(),
};

describe("learn saga (step 4)", () => {
  describe("SagaSatelliteSidebar", () => {
    const essay = makeCard({ id: "e1", type: "essay" });
    const satellites = [
      makeCard({ id: "f1", type: "flash", parentId: essay.id, question: "Sat A?" }),
      makeCard({ id: "f2", type: "flash", parentId: essay.id, question: "Sat B?" }),
    ];

    it("shows minimized hint before saga flash phase", () => {
      render(
        <SagaSatelliteSidebar
          satellites={satellites}
          activeIndex={0}
          completedIds={new Set()}
          mode="minimized"
        />,
      );

      expect(screen.getByText(/Blic sateliti \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Blic provjere počinju nakon ocjene eseja/i)).toBeInTheDocument();
    });

    it("highlights active satellite during saga-flash", () => {
      render(
        <SagaSatelliteSidebar
          satellites={satellites}
          activeIndex={1}
          completedIds={new Set(["f1"])}
          mode="active"
        />,
      );

      expect(screen.getByText(/Aktivno/i)).toBeInTheDocument();
      expect(screen.getByText("Sat B?")).toBeInTheDocument();
    });
  });

  describe("ParentEssayScaffold", () => {
    it("renders locked parent essay context for Blic juriš", () => {
      const essay = makeCard({
        id: "e1",
        type: "essay",
        question: "Roditeljski esej?",
      });

      render(<ParentEssayScaffold essay={essay} />);

      expect(screen.getByText(/Kontekst eseja/i)).toBeInTheDocument();
      expect(screen.getByText("Roditeljski esej?")).toBeInTheDocument();
    });
  });

  describe("StudyModeRecall", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("enters saga-flash after essay is graded when satellites exist", async () => {
      const essay = makeCard({ id: "essay-1", type: "essay", question: "Esej?" });
      const flash = makeCard({
        id: "flash-1",
        type: "flash",
        parentId: essay.id,
        question: "Blic sat?",
      });

      render(
        <StudyModeRecall
          card={essay}
          allCards={[essay, flash]}
          {...sortedCardsProps}
          sortedCards={[essay]}
        />,
      );

      expect(screen.getByText(/Blic sateliti \(1\)/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Pročitao sam/i }));
      fireEvent.click(screen.getByRole("button", { name: /Prikaži odgovor/i }));
      fireEvent.click(screen.getByRole("button", { name: /4 — Lako/i }));

      await waitFor(() => {
        expect(screen.getByText(/Saga — blic 1 \/ 1/i)).toBeInTheDocument();
      });
    });

    it("grades satellites independently via onReviewSection", async () => {
      const onReviewSection = vi.fn();
      const essay = makeCard({ id: "essay-3", type: "essay" });
      const flash = makeCard({
        id: "flash-3",
        type: "flash",
        parentId: essay.id,
        question: "Sat?",
      });

      render(
        <StudyModeRecall
          card={essay}
          allCards={[essay, flash]}
          {...sortedCardsProps}
          sortedCards={[essay]}
          onReviewSection={onReviewSection}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Pročitao sam/i }));
      fireEvent.click(screen.getByRole("button", { name: /Prikaži odgovor/i }));
      fireEvent.click(screen.getByRole("button", { name: /4 — Lako/i }));
      fireEvent.click(screen.getByRole("button", { name: /Prikaži odgovor/i }));
      fireEvent.click(screen.getByRole("button", { name: /3 — Dobro/i }));

      await waitFor(() => {
        expect(onReviewSection).toHaveBeenCalledWith(
          flash.id,
          flash.sections[0]!.id,
          3,
        );
      });
    });

    it("shows Blic juriš layout for standalone flash with parentId", () => {
      const essay = makeCard({ id: "essay-2", type: "essay", question: "Kontekst?" });
      const flash = makeCard({
        id: "flash-2",
        type: "flash",
        parentId: essay.id,
        question: "Izolovani blic?",
      });

      render(
        <StudyModeRecall
          card={flash}
          allCards={[essay, flash]}
          {...sortedCardsProps}
          sortedCards={[flash]}
        />,
      );

      expect(screen.getByText(/Blic juriš/i)).toBeInTheDocument();
      expect(screen.getByText("Kontekst?")).toBeInTheDocument();
    });

    it("skips read gate in strict-recall and shows flash question in assault recall", () => {
      const essay = makeCard({ id: "essay-3", type: "essay", question: "Esej kontekst" });
      const flash = makeCard({
        id: "flash-3",
        type: "flash",
        parentId: essay.id,
        question: "Mikro pitanje?",
      });

      render(
        <StudyModeRecall
          card={flash}
          allCards={[essay, flash]}
          {...sortedCardsProps}
          sortedCards={[flash]}
          strictRecall
        />,
      );

      expect(screen.queryByText(/Pročitao sam/i)).not.toBeInTheDocument();
      expect(screen.getByText("Mikro pitanje?")).toBeInTheDocument();
      expect(screen.getByText(/Blic juriš/i)).toBeInTheDocument();
    });

    it("does not use Blic juriš when parent essay is in the same Learn queue", () => {
      const essay = makeCard({ id: "essay-4", type: "essay", question: "U redu eseja" });
      const flash = makeCard({
        id: "flash-4",
        type: "flash",
        parentId: essay.id,
        question: "Satelit u redu?",
      });

      render(
        <StudyModeRecall
          card={flash}
          allCards={[essay, flash]}
          {...sortedCardsProps}
          sortedCards={[essay, flash]}
        />,
      );

      expect(screen.queryByText(/Blic juriš/i)).not.toBeInTheDocument();
    });
  });
});
