import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AttachEssayDialog } from "@/components/category/AttachEssayDialog";
import { SATELLITE_OVERLOAD_THRESHOLD } from "@/lib/saga/saga-attach";
import { makeCard } from "@/test/factories";

describe("card saga UI (step 3)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("AttachEssayDialog", () => {
    const essayA = makeCard({
      id: "essay-a",
      type: "essay",
      question: "Prvi esej o temi",
    });
    const essayB = makeCard({
      id: "essay-b",
      type: "essay",
      question: "Drugi esej",
      isEndangered: true,
    });
    const flash = makeCard({
      id: "flash-1",
      type: "flash",
      question: "Blic pitanje?",
      parentId: "essay-a",
    });

    it("lists essay candidates and calls onAttach with selected id", async () => {
      const onAttach = vi.fn();
      render(
        <AttachEssayDialog
          open
          onOpenChange={() => {}}
          flashCards={[flash]}
          allCards={[essayA, essayB, flash]}
          essayCandidates={[essayA, essayB]}
          onAttach={onAttach}
        />,
      );

      fireEvent.click(screen.getByRole("option", { name: /Drugi esej/i }));
      await waitFor(() => {
        expect(onAttach).toHaveBeenCalledWith(["flash-1"], "essay-b");
      });
    });

    it("shows current parent and detaches on Ukloni", async () => {
      const onAttach = vi.fn();
      render(
        <AttachEssayDialog
          open
          onOpenChange={() => {}}
          flashCards={[flash]}
          allCards={[essayA, essayB, flash]}
          essayCandidates={[essayA, essayB]}
          onAttach={onAttach}
        />,
      );

      expect(screen.getByText(/Trenutno: Prvi esej o temi/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Ukloni/i }));
      await waitFor(() => {
        expect(onAttach).toHaveBeenCalledWith(["flash-1"], undefined);
      });
    });

    it("filters essays by search query", () => {
      render(
        <AttachEssayDialog
          open
          onOpenChange={() => {}}
          flashCards={[makeCard({ id: "f2", type: "flash" })]}
          allCards={[essayA, essayB]}
          essayCandidates={[essayA, essayB]}
          onAttach={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText("Pretraži eseje…"), {
        target: { value: "Drugi" },
      });

      expect(screen.getByRole("option", { name: /Drugi esej/i })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /Prvi esej/i })).not.toBeInTheDocument();
    });

    it("bulk mode attaches all selected flash ids", async () => {
      const flashB = makeCard({ id: "flash-2", type: "flash", question: "Drugi blic?" });
      const onAttach = vi.fn();
      render(
        <AttachEssayDialog
          open
          onOpenChange={() => {}}
          flashCards={[flash, flashB]}
          allCards={[essayA, essayB, flash, flashB]}
          essayCandidates={[essayA, essayB]}
          onAttach={onAttach}
        />,
      );

      expect(screen.getByText(/2 izabranih blic kartica/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("option", { name: /Drugi esej/i }));
      await waitFor(() => {
        expect(onAttach).toHaveBeenCalledWith(["flash-1", "flash-2"], "essay-b");
      });
    });

    it("shows overload warning when essay would exceed satellite threshold", () => {
      const overloadedEssay = makeCard({
        id: "essay-heavy",
        type: "essay",
        question: "Preopterećen esej",
      });
      const existing = Array.from({ length: SATELLITE_OVERLOAD_THRESHOLD }, (_, i) =>
        makeCard({ id: `sat-${i}`, type: "flash", parentId: "essay-heavy" }),
      );
      const incoming = makeCard({ id: "flash-new", type: "flash" });
      const allCards = [overloadedEssay, ...existing, incoming];

      render(
        <AttachEssayDialog
          open
          onOpenChange={() => {}}
          flashCards={[incoming]}
          allCards={allCards}
          essayCandidates={[overloadedEssay]}
          onAttach={vi.fn()}
        />,
      );

      expect(screen.getByText(/preopterećen koncept/i)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`${SATELLITE_OVERLOAD_THRESHOLD + 1} nakon priključivanja`))).toBeInTheDocument();
    });
  });
});
