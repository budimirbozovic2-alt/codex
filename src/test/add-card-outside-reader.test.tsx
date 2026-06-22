/**
 * Van Source Readera: CardCreateMenu → AddCardDialog → useCardCRUD → SQLite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import { AddCardDialog } from "@/components/category/CardViewDialogs";
import { useCardCRUD } from "@/hooks/useCardCRUD";
import { makeQueryWrapper } from "@/test/helpers/queryWrapper";
import { listAllCards } from "@/lib/db/queries";
import { installBodyPointerEventsGuard } from "@/lib/body-pointer-events-guard";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const CATEGORY_ID = "cat-manual-add";

describe("add question outside Source Reader", () => {
  let disposeGuard: (() => void) | null = null;

  beforeEach(() => {
    disposeGuard = installBodyPointerEventsGuard();
  });

  afterEach(() => {
    disposeGuard?.();
    disposeGuard = null;
  });

  it("useCardCRUD.addFlashCard persists to SQLite", async () => {
    const { result } = renderHook(() => useCardCRUD(), { wrapper: makeQueryWrapper() });

    let createdId = "";
    await act(async () => {
      const card = await result.current.addFlashCard("Blic pitanje?", "Odgovor tekst", CATEGORY_ID);
      createdId = card.id;
    });

    await waitFor(async () => {
      const rows = await listAllCards();
      const saved = rows.find((c) => c.id === createdId);
      expect(saved).toBeDefined();
      expect(saved?.question).toBe("Blic pitanje?");
      expect(saved?.type).toBe("flash");
      expect(saved?.categoryId).toBe(CATEGORY_ID);
    });
  });

  it("useCardCRUD.addCard persists essay to SQLite", async () => {
    const { result } = renderHook(() => useCardCRUD(), { wrapper: makeQueryWrapper() });
    const { htmlToDoc } = await import("@/lib/editor-v4");

    let createdId = "";
    await act(async () => {
      const card = await result.current.addCard(
        "Esej pitanje?",
        [{ title: "Odgovor", contentDoc: htmlToDoc("<p>Esej sadržaj</p>") }],
        CATEGORY_ID,
      );
      createdId = card.id;
    });

    await waitFor(async () => {
      const rows = await listAllCards();
      const saved = rows.find((c) => c.id === createdId);
      expect(saved).toBeDefined();
      expect(saved?.question).toBe("Esej pitanje?");
      expect(saved?.type).toBe("essay");
    });
  });

  it("AddCardDialog calls addFlashCard on save (UI wiring)", async () => {
    const addFlashCard = vi.fn().mockResolvedValue({ id: "mock" });
    const addCard = vi.fn().mockResolvedValue({ id: "mock" });

    render(
      <AddCardDialog
        open
        onOpenChange={vi.fn()}
        categoryId={CATEGORY_ID}
        addCard={addCard}
        addFlashCard={addFlashCard}
        defaultMode="flash"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Unesite pitanje..."), {
      target: { value: "UI pitanje" },
    });
    fireEvent.change(screen.getByPlaceholderText("Unesite odgovor..."), {
      target: { value: "UI odgovor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sačuvaj/i }));

    await waitFor(() => {
      expect(addFlashCard).toHaveBeenCalledWith("UI pitanje", "UI odgovor", CATEGORY_ID);
    });
    expect(addCard).not.toHaveBeenCalled();
  });
});
