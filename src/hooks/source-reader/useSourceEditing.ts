import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { toast } from "sonner";
import type { Source } from "@/lib/sources-storage";
import { useSourceReaderStore } from "@/store";
import {
  applyHeadingChange, applyListWrap, collectIntersectingBlocks,
} from "@/lib/source-reader/source-html-pipeline";
import {
  persistSourceHtml, persistAutoFormat,
} from "@/lib/services/sourceEditingService";
import { taskScheduler } from "@/lib/scheduler";
import { usePersistedDraftMirror } from "@/hooks/usePersistedDraftMirror";

/**
 * Source HTML editing actions: heading toggle, list wrap, context menu,
 * auto-format, debounced autosave, inline format. Persistence is delegated
 * to `sourceEditingService`; DOM transforms to `source-html-pipeline`.
 */
export function useSourceEditing(
  source: Source,
  contentRef: RefObject<HTMLDivElement>,
  onSourceUpdated?: (s: Source) => void,
) {
  const handleSetHeading = useCallback(async (level: number | null, targetEl?: HTMLElement) => {
    const el = targetEl || useSourceReaderStore.getState().headingMenu?.element;
    if (!el) return;
    const container = contentRef.current;
    useSourceReaderStore.getState().setHeadingMenu(null);
    if (!container) return;
    const changed = applyHeadingChange(el, level);
    if (!changed) return;
    await persistSourceHtml(source, container.innerHTML, onSourceUpdated);
    toast.success(level ? `Postavljeno kao H${level}` : "Vraćeno na paragraf");
  }, [source, onSourceUpdated, contentRef]);

  const handleFormatAsList = useCallback(async (type: "ol" | "ul") => {
    const container = contentRef.current;
    useSourceReaderStore.getState().setHeadingMenu(null);
    if (!container) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const wrapped = applyListWrap(container, range, type);
    if (!wrapped) return;
    sel.removeAllRanges();
    await persistSourceHtml(source, container.innerHTML, onSourceUpdated);
    toast.success(type === "ol" ? "Pretvoreno u numerisanu listu" : "Pretvoreno u listu");
  }, [source, onSourceUpdated, contentRef]);

  const handleFormatSelectionAs = useCallback(async (tag: "h1" | "h2" | "h3" | "p" | "ol" | "ul") => {
    if (tag === "ol" || tag === "ul") {
      await handleFormatAsList(tag);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const container = contentRef.current;
    if (!container) return;
    const range = sel.getRangeAt(0);
    const blocks = collectIntersectingBlocks(container, range);
    if (blocks.length === 0) return;
    const level = tag === "p" ? null : parseInt(tag[1]);
    for (const block of blocks) {
      await handleSetHeading(level, block);
    }
    sel.removeAllRanges();
  }, [handleSetHeading, handleFormatAsList, contentRef]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!useSourceReaderStore.getState().editMode) return;
    const target = e.target as HTMLElement;
    const block = target.closest("p, h1, h2, h3, h4, li, ol, ul, div");
    if (!block) return;
    const container = contentRef.current;
    if (!container || !container.contains(block)) return;
    e.preventDefault();
    useSourceReaderStore.getState().setHeadingMenu({
      x: e.clientX, y: e.clientY, element: block as HTMLElement,
    });
  }, [contentRef]);

  // Auto-close heading menu when it opens (single-shot click handler).
  useEffect(() => {
    const store = useSourceReaderStore;
    let closeHandler: (() => void) | null = null;
    const unsub = store.subscribe((state, prev) => {
      if (state.headingMenu && !prev.headingMenu) {
        if (closeHandler) window.removeEventListener("click", closeHandler);
        closeHandler = () => { store.getState().setHeadingMenu(null); closeHandler = null; };
        window.addEventListener("click", closeHandler, { once: true });
      } else if (!state.headingMenu && prev.headingMenu && closeHandler) {
        window.removeEventListener("click", closeHandler);
        closeHandler = null;
      }
    });
    return () => {
      unsub();
      if (closeHandler) window.removeEventListener("click", closeHandler);
    };
  }, []);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleInlineFormat = useCallback((command: string, value?: string) => {
    if (command === "noop") return;
    const el = contentRef.current;
    if (!el) return;
    el.focus();
    if (command === "formatBlock") {
      document.execCommand("formatBlock", false, `<${value}>`);
    } else {
      document.execCommand(command, false, value);
    }
  }, [contentRef]);

  const handleAutoFormatArticles = useCallback(async () => {
    const result = await persistAutoFormat(source, onSourceUpdated);
    if (result.count === 0) {
      toast.info("Nisu pronađeni članovi za formatiranje", { description: 'Tražim pattern: "Član X"' });
      return;
    }
    toast.success(`Formatirano ${result.count} članova`, { description: "Članovi i nazivi su boldovani" });
  }, [source, onSourceUpdated]);

  // Debounced autosave for contentEditable input. Funneled through the central
  // task scheduler so it participates in shutdown / inspection. The draft is
  // also mirrored to the IDB `drafts` table for crash recovery — long source
  // edits would otherwise be lost on tab close between debounce ticks.
  const [draftHtml, setDraftHtml] = useState<string>(source.htmlContent);

  // Reset mirror baseline whenever the underlying source id/version changes.
  useEffect(() => {
    setDraftHtml(source.htmlContent);
  }, [source.id, source.version, source.htmlContent]);

  const persistDebounced = useMemo(
    () => taskScheduler.debounce(
      async (html: string) => {
        await persistSourceHtml(source, html, onSourceUpdated);
      },
      1000,
      { label: `sourceEditing:${source.id}`, pauseWhenHidden: false },
    ),
    [source, onSourceUpdated],
  );

  // Cancel pending debounce on source change / unmount so the next source
  // never receives a write meant for the previous one.
  useEffect(() => () => { persistDebounced.cancel(); }, [persistDebounced]);

  const handleEditInput = useCallback(() => {
    const container = contentRef.current;
    if (!container) return;
    const html = container.innerHTML;
    setDraftHtml(html);
    persistDebounced(html);
  }, [contentRef, persistDebounced]);

  usePersistedDraftMirror({
    key: `source:${source.id}`,
    source: "source-html",
    enabled: draftHtml !== source.htmlContent,
    payload: draftHtml,
  });

  return {
    handleSetHeading,
    handleFormatAsList,
    handleFormatSelectionAs,
    handleContextMenu,
    handleAutoFormatArticles,
    handleEditInput,
    handleInlineFormat,
    scrollToHeading,
  };
}
