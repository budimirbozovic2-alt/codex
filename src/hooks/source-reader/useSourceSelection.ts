import { useCallback, useEffect, useRef } from "react";
import { useSourceReaderStore } from "@/store";
import { taskScheduler } from "@/lib/scheduler";

/**
 * DOM selection capture + global click-away reset for the source reader.
 * Owns the `contentRef` shared by mapping/editing hooks.
 */
export function useSourceSelection() {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length < 10) return;
      const range = sel.getRangeAt(0);
      const container = contentRef.current || document.querySelector("[data-coverage-container]");
      if (!container || !container.contains(range.commonAncestorContainer)) return;
      const fragment = range.cloneContents();
      const wrapper = document.createElement("div");
      wrapper.appendChild(fragment);
      const html = wrapper.innerHTML;
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      useSourceReaderStore.getState().setSelection({
        text,
        html,
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.bottom - containerRect.top + 8,
      });
    }, 10);
  }, []);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-source-tooltip]") || target.closest("[data-exam-sidebar]")) return;
      useSourceReaderStore.getState().setSelection(null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  return { contentRef, handleMouseUp };
}
