import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardOrgDnd } from "@/hooks/useCardOrgDnd";
import { makeCard } from "@/test/factories";
import type { TreeNode } from "@/components/category/org-mode/org-mode-utils";

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

describe("useCardOrgDnd saga attach", () => {
  const essay = makeCard({
    id: "essay-1",
    type: "essay",
    question: "Esej?",
    subcategoryId: "sub-1",
    chapterId: "ch-1",
  });
  const flash = makeCard({
    id: "flash-1",
    type: "flash",
    question: "Blic?",
  });

  const tree: TreeNode[] = [
    {
      subcategory: "Potkategorija",
      subcategoryId: "sub-1",
      chapters: [
        { chapter: "Glava", chapterId: "ch-1", cards: [essay, flash] },
      ],
      unassigned: [],
    },
  ];

  it("attaches flash to essay when dropped on essay card id", () => {
    const patchCard = vi.fn();
    const { result } = renderHook(() =>
      useCardOrgDnd({ cards: [essay, flash], tree, patchCard }),
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "flash-1" },
        over: { id: "essay-1" },
      } as never);
    });

    expect(patchCard).toHaveBeenCalledWith("flash-1", expect.any(Function));
    const updater = patchCard.mock.calls[0]![1] as (c: typeof flash) => typeof flash;
    const patched = updater(flash);
    expect(patched.parentId).toBe("essay-1");
    expect(patched.subcategoryId).toBe("sub-1");
    expect(patched.chapterId).toBe("ch-1");
  });

  it("attaches flash via explicit essay drop zone id", () => {
    const patchCard = vi.fn();
    const { result } = renderHook(() =>
      useCardOrgDnd({ cards: [essay, flash], tree, patchCard }),
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "flash-1" },
        over: { id: "__essay__essay-1" },
      } as never);
    });

    expect(patchCard).toHaveBeenCalledWith("flash-1", expect.any(Function));
  });
});
