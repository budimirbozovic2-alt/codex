import { useEffect } from "react";
import { useSourceReaderStore } from "@/store";

/** Global keyboard shortcuts for the source reader (S = essay, M = exam, Esc = close). */
export function useSourceReaderShortcuts(opts: { onConvertToEssay: () => void }) {
  const { onConvertToEssay } = opts;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const s = useSourceReaderStore.getState();
      if (e.key === "s" || e.key === "S") {
        if (s.selection && !s.editMode) { e.preventDefault(); onConvertToEssay(); }
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        s.setExamOpen(!s.examOpen);
      } else if (e.key === "Escape") {
        if (s.splitSummaryOpen) { s.setSplitSummaryOpen(false); s.setSplitResult(null); }
        else if (s.autoSplitOpen) s.setAutoSplitOpen(false);
        else if (s.selection) s.setSelection(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onConvertToEssay]);
}
