/**
 * SourceReader shell — shortcuts, reactive hasSelection, exam persistence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { useEffect } from "react";
import SourceReader from "@/components/SourceReader";
import { useSourceReaderStore } from "@/store";
import { createSourceTestEditor } from "./helpers/mock-source-editor";
import { makeSource } from "./factories";
import { makeQueryWrapper } from "./helpers/queryWrapper";
import type { Editor } from "@/lib/editor-v4";

const mockConvert = vi.fn();
const mockSaveSource = vi.fn(async () => undefined);

vi.mock("@/hooks/useSourceReaderActions", () => ({
  useSourceReaderActions: () => ({
    actions: {
      handleConvertToEssay: mockConvert,
      handleSmartSplitConfirm: vi.fn(),
      handleLinkToExisting: vi.fn(),
      handleLinkConfirm: vi.fn(),
      handleMapSelection: vi.fn(),
      handleAutoFormatArticles: vi.fn(),
      scrollToHeading: vi.fn(),
    },
  }),
}));

vi.mock("@/hooks/source/useSourceMutations", () => ({
  useSourceMutations: () => ({
    save: { mutateAsync: mockSaveSource },
  }),
}));

vi.mock("@/hooks/mnemonic/useMnemonicMutations", () => ({
  useMnemonicMutations: () => ({ saveCards: { mutateAsync: vi.fn() } }),
}));

vi.mock("@/domains/mnemonic", () => ({
  loadMnemonicCards: vi.fn(async () => []),
  createMnemonicCardFromSelection: vi.fn(),
}));

vi.mock("@/components/source-reader/SourceBubbleMenu", () => ({
  SourceBubbleMenu: () => null,
}));

vi.mock("@/components/source-reader/SourceContent", () => ({
  SourceContent: ({
    onEditorReady,
  }: {
    onEditorReady: (editor: Editor | null) => void;
  }) => {
    useEffect(() => {
      const editor = createSourceTestEditor();
      onEditorReady(editor);
      return () => {
        editor.destroy();
        onEditorReady(null);
      };
    }, [onEditorReady]);
    return <div data-testid="source-content-stub" />;
  },
}));

const Wrapper = makeQueryWrapper();

function renderReader(examQuestions = [{ id: "q1", text: "Šta je podnesak?", done: false }]) {
  const source = makeSource({
    id: "src-shell",
    title: "Zakon",
    examQuestions,
  });
  return render(
    <Wrapper>
      <SourceReader source={source} onBack={vi.fn()} onSourceUpdated={vi.fn()} />
    </Wrapper>,
  );
}

describe("SourceReader shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSourceReaderStore.getState().reset();
    useSourceReaderStore.getState().setExamOpen(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("wires S shortcut to handleConvertToEssay with live selection", () => {
    renderReader();
    const host = document.createElement("div");
    document.body.appendChild(host);

    act(() => {
      host.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
    });
    host.remove();

    expect(mockConvert).toHaveBeenCalledTimes(1);
    const [text, html] = mockConvert.mock.calls[0];
    expect(text.length).toBeGreaterThanOrEqual(5);
    expect(html.length).toBeGreaterThanOrEqual(5);
  });

  it("enables exam map button when editor selection is valid", async () => {
    renderReader();
    const btn = await screen.findByRole("button", { name: /Mapiraj selekciju/i });
    expect(btn).not.toBeDisabled();
  });

  it("debounces exam question persistence (800ms)", async () => {
    vi.useFakeTimers();
    renderReader();

    act(() => {
      useSourceReaderStore.getState().setExamQuestions([
        { id: "q1", text: "Ažurirano pitanje?", done: false },
      ]);
    });

    expect(mockSaveSource).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(mockSaveSource).toHaveBeenCalledTimes(1);
    const saved = mockSaveSource.mock.calls[0][0];
    expect(saved.examQuestions[0].text).toBe("Ažurirano pitanje?");
  });
});
