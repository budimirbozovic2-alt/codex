import { create } from "zustand";
import type { ExamQuestion } from "@/components/ExamSidebar";
import type { SelectionModule } from "@/lib/selection-split-engine";
import type { WizardModuleEdit } from "@/lib/split-wizard-build";
import { defaultEdit } from "@/lib/split-wizard-build";
import type { EditorDoc } from "@/lib/editor-v4";

export type ReaderWidth = "S" | "M" | "L" | "XL" | "Full";

export const WIDTH_CLASSES: Record<ReaderWidth, string> = {
  S: "max-w-2xl",
  M: "max-w-4xl",
  L: "max-w-6xl",
  XL: "max-w-7xl",
  Full: "max-w-none",
};

const WIDTH_STORAGE_KEY = "codex-source-reader-width";
const FONT_SIZE_STORAGE_KEY = "codex-source-reader-font-size";
const LINE_HEIGHT_STORAGE_KEY = "codex-source-reader-line-height";

export type ReaderFontSize = "sm" | "base" | "lg";
export type ReaderLineHeight = "normal" | "relaxed" | "loose";

export const READER_FONT_SIZE_CLASS: Record<ReaderFontSize, string> = {
  sm: "prose-sm",
  base: "prose-base",
  lg: "prose-lg",
};

export const READER_LINE_HEIGHT_VALUE: Record<ReaderLineHeight, string> = {
  normal: "1.6",
  relaxed: "1.75",
  loose: "2",
};

export const READER_FONT_SIZE_LABELS: Record<ReaderFontSize, string> = {
  sm: "Mali",
  base: "Srednji",
  lg: "Veliki",
};

export const READER_LINE_HEIGHT_LABELS: Record<ReaderLineHeight, string> = {
  normal: "Normalan",
  relaxed: "Prostran",
  loose: "Rastresit",
};

interface SplitResultState {
  modules: SelectionModule[];
  rangeLabel: string;
  parentName: string;
}

interface SourceReaderState {
  // UI state
  editMode: boolean;
  readerWidth: ReaderWidth;
  readerFontSize: ReaderFontSize;
  readerLineHeight: ReaderLineHeight;
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
  linkSelectedDoc: EditorDoc | null;
  examQuestions: ExamQuestion[];

  // Actions
  setEditMode: (v: boolean) => void;
  setReaderWidth: (w: ReaderWidth) => void;
  setReaderFontSize: (size: ReaderFontSize) => void;
  setReaderLineHeight: (height: ReaderLineHeight) => void;
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
  setLinkSelectedDoc: (v: EditorDoc | null) => void;
  setExamQuestions: (v: ExamQuestion[] | ((prev: ExamQuestion[]) => ExamQuestion[])) => void;
  setWizardSubcategoryId: (v: string) => void;
  setWizardChapterId: (v: string) => void;
  reset: () => void;
}

function loadInitialLineHeight(): ReaderLineHeight {
  try {
    const saved = localStorage.getItem(LINE_HEIGHT_STORAGE_KEY);
    if (saved === "normal" || saved === "relaxed" || saved === "loose") return saved;
  } catch { /* noop */ }
  return "relaxed";
}

function loadInitialFontSize(): ReaderFontSize {
  try {
    const saved = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (saved === "sm" || saved === "base" || saved === "lg") return saved;
  } catch { /* noop */ }
  return "base";
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
  readerFontSize: loadInitialFontSize(),
  readerLineHeight: loadInitialLineHeight(),
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
  linkSelectedDoc: null as EditorDoc | null,
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
  setReaderFontSize: (size) => {
    try { localStorage.setItem(FONT_SIZE_STORAGE_KEY, size); } catch { /* noop */ }
    set({ readerFontSize: size });
  },
  setReaderLineHeight: (height) => {
    try { localStorage.setItem(LINE_HEIGHT_STORAGE_KEY, height); } catch { /* noop */ }
    set({ readerLineHeight: height });
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
  setLinkSelectedDoc: (v) => set({ linkSelectedDoc: v }),
  setExamQuestions: (v) => {
    if (typeof v === "function") {
      set({ examQuestions: v(get().examQuestions) });
    } else {
      set({ examQuestions: v });
    }
  },
  reset: () => set({
    ...initialState,
    readerWidth: loadInitialWidth(),
    readerFontSize: loadInitialFontSize(),
    readerLineHeight: loadInitialLineHeight(),
  }),
}));
