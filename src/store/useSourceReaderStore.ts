import { create } from "zustand";
import type { ExamQuestion } from "@/components/ExamSidebar";
import type { SelectionModule } from "@/lib/selection-split-engine";
import type { WizardMode, WizardModuleEdit } from "@/lib/split-wizard-build";
import { defaultEdit } from "@/lib/split-wizard-build";

export type ReaderWidth = "S" | "M" | "L" | "XL" | "Full";

export const WIDTH_CLASSES: Record<ReaderWidth, string> = {
  S: "max-w-2xl",
  M: "max-w-4xl",
  L: "max-w-6xl",
  XL: "max-w-7xl",
  Full: "max-w-none",
};

const WIDTH_STORAGE_KEY = "codex-source-reader-width";

export interface SelectionState {
  text: string;
  /** HTML markup of the selected range (preserves bold/italic/lists/headings). */
  html: string;
  x: number;
  y: number;
}

export interface HeadingMenuState {
  x: number;
  y: number;
  element: HTMLElement;
}

export interface SplitResultState {
  modules: SelectionModule[];
  rangeLabel: string;
  parentName: string;
}

interface SourceReaderState {
  // UI state
  viewMode: "standard" | "coverage";
  editMode: boolean;
  readerWidth: ReaderWidth;
  outlineOpen: boolean;
  examOpen: boolean;
  selection: SelectionState | null;
  headingMenu: HeadingMenuState | null;

  // Dialog state
  essayDialogOpen: boolean;
  essayQuestion: string;
  selectedText: string;
  selectedHtml: string;
  autoSplitOpen: boolean;
  splitSummaryOpen: boolean;
  splitResult: SplitResultState | null;
  splitDone: boolean;
  splitCreatedCount: number;
  splitParentName: string;
  splitModules: SelectionModule[];
  /** Wizard: per-module question/tag/skip overrides, parallel array to splitModules. */
  splitEdits: WizardModuleEdit[];
  /** Wizard: 'separate' = N cards, 'combined' = 1 essay with N module-sections. */
  splitMode: WizardMode;
  /** Wizard: index of the module currently being edited (0-based). */
  splitStepIndex: number;
  linkModalOpen: boolean;
  linkSelectedText: string;
  linkSelectedHtml: string;
  examQuestions: ExamQuestion[];

  // Actions
  setViewMode: (m: "standard" | "coverage") => void;
  setEditMode: (v: boolean) => void;
  setReaderWidth: (w: ReaderWidth) => void;
  setOutlineOpen: (v: boolean) => void;
  setExamOpen: (v: boolean) => void;
  setSelection: (s: SelectionState | null) => void;
  setHeadingMenu: (m: HeadingMenuState | null) => void;
  setEssayDialogOpen: (v: boolean) => void;
  setEssayQuestion: (v: string) => void;
  setSelectedText: (v: string) => void;
  setSelectedHtml: (v: string) => void;
  setAutoSplitOpen: (v: boolean) => void;
  setSplitSummaryOpen: (v: boolean) => void;
  setSplitResult: (v: SplitResultState | null) => void;
  setSplitDone: (v: boolean) => void;
  setSplitCreatedCount: (v: number) => void;
  setSplitParentName: (v: string) => void;
  setSplitModules: (v: SelectionModule[] | ((prev: SelectionModule[]) => SelectionModule[])) => void;
  setSplitEdits: (v: WizardModuleEdit[] | ((prev: WizardModuleEdit[]) => WizardModuleEdit[])) => void;
  setSplitMode: (v: WizardMode) => void;
  setSplitStepIndex: (v: number | ((prev: number) => number)) => void;
  /** Re-initialize wizard state for a fresh split (modules + default edits + step 0). */
  initSplitWizard: (modules: SelectionModule[], parentName: string) => void;
  setLinkModalOpen: (v: boolean) => void;
  setLinkSelectedText: (v: string) => void;
  setLinkSelectedHtml: (v: string) => void;
  setExamQuestions: (v: ExamQuestion[] | ((prev: ExamQuestion[]) => ExamQuestion[])) => void;
  reset: () => void;
}

function loadInitialWidth(): ReaderWidth {
  try {
    const saved = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (saved && saved in WIDTH_CLASSES) return saved as ReaderWidth;
  } catch {}
  return "M";
}

const initialState = {
  viewMode: "standard" as const,
  editMode: false,
  readerWidth: loadInitialWidth(),
  outlineOpen: true,
  examOpen: false,
  selection: null as SelectionState | null,
  headingMenu: null as HeadingMenuState | null,
  essayDialogOpen: false,
  essayQuestion: "",
  selectedText: "",
  selectedHtml: "",
  autoSplitOpen: false,
  splitSummaryOpen: false,
  splitResult: null as SplitResultState | null,
  splitDone: false,
  splitCreatedCount: 0,
  splitParentName: "",
  splitModules: [] as SelectionModule[],
  linkModalOpen: false,
  linkSelectedText: "",
  linkSelectedHtml: "",
  examQuestions: [] as ExamQuestion[],
};

export const useSourceReaderStore = create<SourceReaderState>((set, get) => ({
  ...initialState,

  setViewMode: (m) => set({ viewMode: m }),
  setEditMode: (v) => set({ editMode: v }),
  setReaderWidth: (w) => {
    try { localStorage.setItem(WIDTH_STORAGE_KEY, w); } catch {}
    set({ readerWidth: w });
  },
  setOutlineOpen: (v) => set({ outlineOpen: v }),
  setExamOpen: (v) => set({ examOpen: v }),
  setSelection: (s) => set({ selection: s }),
  setHeadingMenu: (m) => set({ headingMenu: m }),
  setEssayDialogOpen: (v) => set({ essayDialogOpen: v }),
  setEssayQuestion: (v) => set({ essayQuestion: v }),
  setSelectedText: (v) => set({ selectedText: v }),
  setSelectedHtml: (v) => set({ selectedHtml: v }),
  setAutoSplitOpen: (v) => set({ autoSplitOpen: v }),
  setSplitSummaryOpen: (v) => set({ splitSummaryOpen: v }),
  setSplitResult: (v) => set({ splitResult: v }),
  setSplitDone: (v) => set({ splitDone: v }),
  setSplitCreatedCount: (v) => set({ splitCreatedCount: v }),
  setSplitParentName: (v) => set({ splitParentName: v }),
  setSplitModules: (v) => {
    if (typeof v === "function") {
      set({ splitModules: v(get().splitModules) });
    } else {
      set({ splitModules: v });
    }
  },
  setLinkModalOpen: (v) => set({ linkModalOpen: v }),
  setLinkSelectedText: (v) => set({ linkSelectedText: v }),
  setLinkSelectedHtml: (v) => set({ linkSelectedHtml: v }),
  setExamQuestions: (v) => {
    if (typeof v === "function") {
      set({ examQuestions: v(get().examQuestions) });
    } else {
      set({ examQuestions: v });
    }
  },
  reset: () => set({ ...initialState, readerWidth: loadInitialWidth() }),
}));
