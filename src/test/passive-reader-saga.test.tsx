import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PassiveReader from "@/components/subject-cards/PassiveReader";
import { PassiveReaderSatellitePanel } from "@/components/subject-cards/passive-reader/PassiveReaderSatellitePanel";
import { makeCard } from "@/test/factories";
import { SectionState } from "@/lib/spaced-repetition";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/hooks/cards/useActions", () => ({
  useCardOnlyActions: () => ({
    markRead: vi.fn(),
    addFlashCard: vi.fn(() => makeCard({ id: "new-flash", type: "flash" })),
    patchCard: vi.fn(),
  }),
}));

vi.mock("@/hooks/useGlobalHotkey", () => ({
  useGlobalHotkey: () => {},
}));

vi.mock("@/components/subject-cards/passive-reader/PassiveReaderCard", () => ({
  PassiveReaderCard: ({ card }: { card: { question?: string } }) => (
    <article data-testid="passive-reader-card">{card.question}</article>
  ),
}));

vi.mock("@/components/ui/ContentRenderer", () => ({
  ContentRenderer: ({ doc }: { doc?: unknown }) => (
    <div data-testid="content-renderer">{doc ? "content" : "empty"}</div>
  ),
}));

describe("passive reader saga (step 5)", () => {
  describe("PassiveReaderSatellitePanel", () => {
    const essay = makeCard({ id: "e1", type: "essay", question: "Esej pitanje" });
    const flashA = makeCard({
      id: "f1",
      type: "flash",
      parentId: essay.id,
      question: "Blic A?",
      sectionsHtml: ["<p>Odgovor A</p>"],
    });
    const flashB = makeCard({
      id: "f2",
      type: "flash",
      parentId: essay.id,
      question: "Blic B?",
      sectionsHtml: ["<p>Odgovor B</p>"],
    });

    it("lists flash questions and expands answer on click", () => {
      const onToggle = vi.fn();

      render(
        <PassiveReaderSatellitePanel
          satellites={[flashA, flashB]}
          expandedId={null}
          onToggle={onToggle}
        />,
      );

      expect(screen.getByText("Blic A?")).toBeInTheDocument();
      expect(screen.getByText("Blic B?")).toBeInTheDocument();
      expect(screen.queryByTestId("content-renderer")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Blic A/i }));
      expect(onToggle).toHaveBeenCalledWith("f1");
    });

    it("shows expanded flash answer when open", () => {
      render(
        <PassiveReaderSatellitePanel
          satellites={[flashA, flashB]}
          expandedId="f1"
          onToggle={vi.fn()}
        />,
      );

      expect(screen.getByTestId("content-renderer")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Blic A/i })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("button", { name: /Blic B/i })).toHaveAttribute("aria-expanded", "false");
    });

    it("shows FSRS status badge per satellite", () => {
      const dueFlash = makeCard({
        id: "f-due",
        type: "flash",
        parentId: essay.id,
        question: "Dospjelo?",
        sections: [{
          id: "s-due",
          state: SectionState.Review,
          nextReview: Date.now() - 1000,
          stability: 3,
        }],
      });

      render(
        <PassiveReaderSatellitePanel
          satellites={[dueFlash]}
          expandedId={null}
          onToggle={vi.fn()}
        />,
      );

      expect(screen.getByText("Dospjelo")).toBeInTheDocument();
    });
  });

  describe("PassiveReader dual column", () => {
    const categoryId = "cat_passive";

    it("renders essay + sticky satellite sidebar when essay has satellites", async () => {
      const essay = makeCard({
        id: "pr-e1",
        categoryId,
        type: "essay",
        question: "Glavni esej?",
      });
      const flash = makeCard({
        id: "pr-f1",
        categoryId,
        type: "flash",
        parentId: essay.id,
        question: "Satelit pitanje?",
      });

      const { container } = render(
        <MemoryRouter>
          <PassiveReader
            cards={[essay, flash]}
            subcategoryNodes={[]}
            categoryId={categoryId}
          />
        </MemoryRouter>,
      );

      expect(await screen.findByTestId("passive-reader-card")).toHaveTextContent("Glavni esej?");
      expect(screen.getByText(/Blic potpitanja \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText("Satelit pitanje?")).toBeInTheDocument();
      expect(container.querySelector(".lg\\:sticky")).toBeTruthy();
    });

    it("uses single column when essay has no satellites", async () => {
      const essay = makeCard({
        id: "pr-e2",
        categoryId,
        type: "essay",
        question: "Samostalni esej",
      });

      render(
        <MemoryRouter>
          <PassiveReader
            cards={[essay]}
            subcategoryNodes={[]}
            categoryId={categoryId}
          />
        </MemoryRouter>,
      );

      expect(await screen.findByTestId("passive-reader-card")).toHaveTextContent("Samostalni esej");
      expect(screen.queryByText(/Blic potpitanja/i)).not.toBeInTheDocument();
    });

    it("excludes nested satellites from the passive reader queue", () => {
      const essay = makeCard({ id: "pr-e3", categoryId, type: "essay" });
      const nested = makeCard({
        id: "pr-f3",
        categoryId,
        type: "flash",
        parentId: essay.id,
      });

      render(
        <MemoryRouter>
          <PassiveReader
            cards={[essay, nested]}
            subcategoryNodes={[]}
            categoryId={categoryId}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });

    it("collapses expanded satellite when navigating to next card", async () => {
      const essayA = makeCard({
        id: "pr-e4a",
        categoryId,
        type: "essay",
        question: "Esej A",
      });
      const flash = makeCard({
        id: "pr-f4",
        categoryId,
        type: "flash",
        parentId: essayA.id,
        question: "Blic za A",
        sectionsHtml: ["<p>Odg</p>"],
      });
      const essayB = makeCard({
        id: "pr-e4b",
        categoryId,
        type: "essay",
        question: "Esej B",
      });

      render(
        <MemoryRouter>
          <PassiveReader
            cards={[essayA, flash, essayB]}
            subcategoryNodes={[]}
            categoryId={categoryId}
          />
        </MemoryRouter>,
      );

      await screen.findByTestId("passive-reader-card");

      fireEvent.click(screen.getByRole("button", { name: /Blic za A/i }));
      expect(screen.getByTestId("content-renderer")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Sljedeća/i }));

      await waitFor(() => {
        expect(screen.getByTestId("passive-reader-card")).toHaveTextContent("Esej B");
      });
      expect(screen.queryByTestId("content-renderer")).not.toBeInTheDocument();
    });

    it("navigates to Learn with focus card when Testiraj ovaj blok is clicked", async () => {
      navigateMock.mockClear();
      const essay = makeCard({
        id: "pr-test",
        categoryId,
        type: "essay",
        question: "Za test?",
      });

      render(
        <MemoryRouter>
          <PassiveReader
            cards={[essay]}
            subcategoryNodes={[]}
            categoryId={categoryId}
          />
        </MemoryRouter>,
      );

      await screen.findByTestId("passive-reader-card");
      fireEvent.click(screen.getByRole("button", { name: /Testiraj ovaj blok/i }));

      expect(navigateMock).toHaveBeenCalledWith(
        `/learn?category=${categoryId}&mode=strict-recall&card=pr-test`,
      );
    });
  });
});
