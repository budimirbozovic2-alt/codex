/**

 * SourceContent autosave, baseline, error recovery, and draft banner.

 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import { forwardRef, useEffect, useImperativeHandle } from "react";

import type { EditorDoc } from "@/lib/editor-v4";

import { SourceContent } from "@/components/source-reader/SourceContent";

import { useSourceContentSaveStore, flushSourceContentSave } from "@/store/useSourceContentSaveStore";
import { useSourceReaderStore } from "@/store";
import { taskScheduler } from "@/lib/scheduler";

import { makeSource } from "./factories";

import { makeQueryWrapper } from "./helpers/queryWrapper";

import { flushMicrotasks } from "./helpers/timers";



const mockSave = vi.hoisted(() => vi.fn(async () => undefined));

const stableSaveMutation = vi.hoisted(() => ({ mutateAsync: mockSave }));

const mockGetDraft = vi.hoisted(() =>

  vi.fn(async () => null as Awaited<ReturnType<typeof import("@/lib/drafts").getDraft>>),

);

const mockDeleteDraft = vi.hoisted(() => vi.fn(async () => undefined));



vi.mock("@/lib/drafts", async (importOriginal) => {

  const actual = await importOriginal<typeof import("@/lib/drafts")>();

  return {

    ...actual,

    getDraft: (...args: unknown[]) => mockGetDraft(...args),

    deleteDraft: (...args: unknown[]) => mockDeleteDraft(...args),

  };

});





vi.mock("sonner", () => ({

  toast: {

    error: vi.fn(),

    success: vi.fn(),

  },

}));



vi.mock("@/hooks/usePersistedDraftMirror", () => ({

  usePersistedDraftMirror: vi.fn(),

}));



vi.mock("@/hooks/source/useSourceMutations", () => ({

  useSourceMutations: () => ({

    save: stableSaveMutation,

  }),

}));



const CHANGED_DOC: EditorDoc = {

  version: 4,

  content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },

};



const RECOVERED_DOC: EditorDoc = {

  version: 4,

  content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Recovered" }] }] },

};



vi.mock("@/components/editor-v4/EditorV4", () => ({

  EditorV4: forwardRef(function MockEditorV4(

    { onChange, onEditorReady }: {

      onChange?: (doc: EditorDoc) => void;

      onEditorReady?: (editor: unknown) => void;

    },

    ref,

  ) {

    useImperativeHandle(ref, () => ({

      getEditor: () => ({

        getJSON: () => CHANGED_DOC.content,

        commands: { setContent: vi.fn() },

      }),

    }));

    useEffect(() => {

      onEditorReady?.(null);

    }, [onEditorReady]);

    return (

      <button

        type="button"

        data-testid="mock-editor"

        onClick={() => onChange?.(CHANGED_DOC)}

      >

        Edit

      </button>

    );

  }),

}));



import { toast } from "sonner";



const Wrapper = makeQueryWrapper();



function renderSourceContent(overrides: Partial<ReturnType<typeof makeSource>> = {}) {

  const source = makeSource({ id: "src-auto", title: "Zakon", html: "<p>A</p>", ...overrides });

  return render(

    <Wrapper>

      <SourceContent

        source={source}

        editMode

        onEditorReady={vi.fn()}

      />

    </Wrapper>,

  );

}



describe("SourceContent autosave", () => {

  beforeEach(() => {

    vi.useFakeTimers();

    taskScheduler.__resetForTests();

    mockSave.mockClear();

    mockSave.mockResolvedValue(undefined);

    mockGetDraft.mockReset();

    mockGetDraft.mockResolvedValue(null);

    mockDeleteDraft.mockClear();

    useSourceContentSaveStore.getState().reset();

  });



  afterEach(() => {

    taskScheduler.__resetForTests();

    vi.useRealTimers();

  });



  it("debounces save and updates baseline after success", async () => {

    renderSourceContent();



    fireEvent.click(screen.getByTestId("mock-editor"));

    expect(useSourceContentSaveStore.getState().status).toBe("dirty");



    await act(async () => {

      await vi.advanceTimersByTimeAsync(1000);

      await flushMicrotasks();

    });



    expect(mockSave).toHaveBeenCalledTimes(1);

    expect(useSourceContentSaveStore.getState().status).toBe("saved");

    expect(useSourceContentSaveStore.getState().isDirty).toBe(false);



    mockSave.mockClear();

    fireEvent.click(screen.getByTestId("mock-editor"));

    await act(async () => {

      await vi.advanceTimersByTimeAsync(1000);

      await flushMicrotasks();

    });

    expect(mockSave).not.toHaveBeenCalled();

  });



  it("flushSourceContentSave persists immediately without waiting for debounce", async () => {

    renderSourceContent();



    fireEvent.click(screen.getByTestId("mock-editor"));

    expect(mockSave).not.toHaveBeenCalled();



    await act(async () => {

      const ok = await flushSourceContentSave();

      expect(ok).toBe(true);

      await flushMicrotasks();

    });



    expect(mockSave).toHaveBeenCalledTimes(1);

    expect(useSourceContentSaveStore.getState().isDirty).toBe(false);

  });



  it("surfaces save errors via store and toast", async () => {

    mockSave.mockRejectedValueOnce(new Error("fail"));

    renderSourceContent();



    fireEvent.click(screen.getByTestId("mock-editor"));

    await act(async () => {

      await vi.advanceTimersByTimeAsync(1000);

      await flushMicrotasks();

    });



    expect(useSourceContentSaveStore.getState().status).toBe("error");

    expect(toast.error).toHaveBeenCalledWith(

      "Čuvanje izvora nije uspjelo",

      expect.objectContaining({

        description: "Pokušajte ponovo.",

      }),

    );

  });



  it("resets save store when source id changes", async () => {

    const { rerender } = renderSourceContent({ id: "src-one" });

    fireEvent.click(screen.getByTestId("mock-editor"));

    expect(useSourceContentSaveStore.getState().isDirty).toBe(true);



    const nextSource = makeSource({ id: "src-two", title: "Drugi", html: "<p>C</p>" });

    rerender(

      <Wrapper>

        <SourceContent source={nextSource} editMode onEditorReady={vi.fn()} />

      </Wrapper>,

    );



    expect(useSourceContentSaveStore.getState().status).toBe("idle");

    expect(useSourceContentSaveStore.getState().isDirty).toBe(false);

  });

});



describe("SourceContent draft recovery banner", () => {

  beforeEach(() => {

    mockSave.mockClear();

    mockSave.mockResolvedValue(undefined);

    mockGetDraft.mockReset();

    mockDeleteDraft.mockClear();

    useSourceContentSaveStore.getState().reset();

  });



  it("shows draft recovery banner and supports restore/dismiss", async () => {

    mockGetDraft.mockResolvedValue({

      key: "source:src-auto",

      source: "source-html",

      payload: RECOVERED_DOC,

      updatedAt: Date.now(),

    });



    renderSourceContent();



    expect(

      await screen.findByText(/Pronađene su nesačuvane izmjene ovog izvora/),

    ).toBeInTheDocument();



    fireEvent.click(screen.getByRole("button", { name: /Nastavi/i }));

    expect(toast.success).toHaveBeenCalledWith("Nesačuvane izmjene učitane");

    await waitFor(() => {

      expect(screen.queryByText(/Pronađene su nesačuvane izmjene/)).not.toBeInTheDocument();

    });



    mockGetDraft.mockResolvedValue({

      key: "source:src-auto",

      source: "source-html",

      payload: RECOVERED_DOC,

      updatedAt: Date.now(),

    });

    renderSourceContent();



    fireEvent.click(await screen.findByRole("button", { name: /Odbaci/i }));

    expect(mockDeleteDraft).toHaveBeenCalledWith("source:src-auto");

  });

});

