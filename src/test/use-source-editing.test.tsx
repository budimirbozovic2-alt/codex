import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSourceEditing } from "@/hooks/source-reader/useSourceEditing";
import { docToHtml } from "@/lib/editor-v4";
import { makeSource } from "./factories";

const mockSave = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/source/useSourceMutations", () => ({
  useSourceMutations: () => ({
    save: { mutateAsync: mockSave },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe("useSourceEditing", () => {
  beforeEach(() => {
    mockSave.mockClear();
  });

  it("handleAutoFormatArticles saves source with updated contentDoc", async () => {
    const source = makeSource({
      html: "<p>Naziv članka</p><p>Član 3</p><p>Sadržaj trećeg člana.</p>",
    });
    const before = docToHtml(source.contentDoc);

    const { result } = renderHook(() => useSourceEditing(source));
    await act(async () => {
      await result.current.handleAutoFormatArticles();
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    const saved = mockSave.mock.calls[0][0];
    expect(docToHtml(saved.contentDoc)).not.toBe(before);
    expect(saved.contentDoc.version).toBe(4);
  });
});
