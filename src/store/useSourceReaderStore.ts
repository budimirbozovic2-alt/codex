import { create } from "zustand";
import type { ExamQuestion } from "@/components/ExamSidebar";
import type { SelectionModule } from "@/lib/selection-split-engine";
import type { WizardModuleEdit } from "@/lib/split-wizard-build";
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

interface SplitResultState {
  modules: SelectionModule[];
  rangeLabel: string;
  parentName: string;
}

interface SourceReaderState {
  // UI state
  editMode: boolean;
  readerWidth: ReaderWidth;
  outlineOpen: boolean;
  examOpen: boolean;

  // Dialog state
  autoSplitOpen: boolean;
  splitSummaryOpen: boolean;
  splitResult: SplitResultState | null;
  splitDone: boolean;
  splitCreatedCount: number;
  splitParentName: string;
  splitModules: SelectionModule[];
  /** Wizard: per-module question/tag/skip overrides, parallel array to splitModules. */
  splitEdits: WizardModuleEdit[];
  /** Wizard: target subcategory UUID for ALL cards (empty = direct in subject). */
  wizardSubcategoryId: string;
  /** Wizard: target chapter UUID (empty = no chapter). Cleared when subcategory changes. */
  wizardChapterId: string;
  linkModalOpen: boolean;
  linkSelectedText: string;
  linkSelectedHtml: string;
  examQuestions: ExamQuestion[];

  // Actions
  setEditMode: (v: boolean) => void;
  setReaderWidth: (w: ReaderWidth) => void;
  setOutlineOpen: (v: boolean) => void;
  setExamOpen: (v: boolean) => void;
  setAutoSplitOpen: (v: boolean) => void;
  setSplitSummaryOpen: (v: boolean) => void;
  setSplitResult: (v: SplitResultState | null) => void;
  setSplitDone: (v: boolean) => void;
  setSplitCreatedCount: (v: number) => void;
  setSplitParentName: (v: string) => void;
  setSplitModules: (v: SelectionModule[] | ((prev: SelectionModule[]) => SelectionModule[])) => void;
  setSplitEdits: (v: WizardModuleEdit[] | ((prev: WizardModuleEdit[]) => WizardModuleEdit[])) => void;
  /** Re-initialize wizard state for a fresh split (modules + default edits). */
  initSplitWizard: (modules: SelectionModule[], parentName: string) => void;
  setLinkModalOpen: (v: boolean) => void;
  setLinkSelectedText: (v: string) => void;
  setLinkSelectedHtml: (v: string) => void;
  setExamQuestions: (v: ExamQuestion[] | ((prev: ExamQuestion[]) => ExamQuestion[])) => void;
  setWizardSubcategoryId: (v: string) => void;
  setWizardChapterId: (v: string) => void;
  reset: () => void;
}

function loadInitialWidth(): ReaderWidth {
  try {
    const saved = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (saved && saved in WIDTH_CLASSES) return saved as ReaderWidth;
  } catch { /* noop */ }
  return "M";
}

const initialState = {
  editMode: false,
  readerWidth: loadInitialWidth(),
  outlineOpen: true,
  examOpen: false,
  autoSplitOpen: false,
  splitSummaryOpen: false,
  splitResult: null as SplitResultState | null,
  splitDone: false,
  splitCreatedCount: 0,
  splitParentName: "",
  splitModules: [] as SelectionModule[],
  splitEdits: [] as WizardModuleEdit[],
  linkModalOpen: false,
  linkSelectedText: "",
  linkSelectedHtml: "",
  examQuestions: [] as ExamQuestion[],
  wizardSubcategoryId: "",
  wizardChapterId: "",
};

export const useSourceReaderStore = create<SourceReaderState>((set, get) => ({
  ...initialState,

  setEditMode: (v) => set({ editMode: v }),
  setReaderWidth: (w) => {
    try { localStorage.setItem(WIDTH_STORAGE_KEY, w); } catch { /* noop */ }
    set({ readerWidth: w });
  },
  setOutlineOpen: (v) => set({ outlineOpen: v }),
  setExamOpen: (v) => set({ examOpen: v }),
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
  setSplitEdits: (v) => {
    if (typeof v === "function") {
      set({ splitEdits: v(get().splitEdits) });
    } else {
      set({ splitEdits: v });
    }
  },
  initSplitWizard: (modules, parentName) => set({
    splitModules: modules,
    splitEdits: modules.map((m) => defaultEdit(m)),
    splitParentName: parentName,
    splitDone: false,
    splitCreatedCount: 0,
    wizardSubcategoryId: "",
    wizardChapterId: "",
  }),
  setWizardSubcategoryId: (v) => set({ wizardSubcategoryId: v, wizardChapterId: "" }),
  setWizardChapterId: (v) => set({ wizardChapterId: v }),
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
