import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSourceLogic } from "@/hooks/useSourceLogic";
import type { Source } from "@/lib/sources-storage";

export type ReaderWidth = "S" | "M" | "L" | "XL" | "Full";

export const WIDTH_CLASSES: Record<ReaderWidth, string> = {
  S: "max-w-2xl",
  M: "max-w-4xl",
  L: "max-w-6xl",
  XL: "max-w-7xl",
  Full: "max-w-none",
};

const STORAGE_KEY = "codex-source-reader-width";

/**
 * Custom hook that encapsulates all logic for the SourceReader component.
 * Combines general source logic with reader-specific state like edit mode, width, and context menus.
 * 
 * @param source The source object being read
 * @param onSourceUpdated Optional callback when the source is updated
 * @returns All state and handlers needed by SourceReader sub-components
 */
export function useSourceReaderLogic(source: Source, onSourceUpdated?: (source: Source) => void) {
  const { state: baseState, actions: baseActions, refs } = useSourceLogic(source);
  const [editMode, setEditMode] = useState(false);
  
  // Sync editModeRef in logic hook to ensure keyboard shortcuts respect edit mode
  useEffect(() => {
    refs.editModeRef.current = editMode;
  }, [editMode, refs.editModeRef]);

  const [readerWidth, setReaderWidth] = useState<ReaderWidth>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved && saved in WIDTH_CLASSES) ? saved as ReaderWidth : "M";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, readerWidth);
  }, [readerWidth]);

  // ─── Heading context menu state ───
  const [headingMenu, setHeadingMenu] = useState<{ x: number; y: number; element: HTMLElement } | null>(null);

  /**
   * Handles the context menu (right click) on content elements.
   * Only active in edit mode.
   */
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!editMode) return;
    const target = e.target as HTMLElement;
    const block = target.closest("p, h1, h2, h3, h4, li, ol, ul, div");
    if (!block) return;
    const container = refs.contentRef.current;
    if (!container || !container.contains(block)) return;
    e.preventDefault();
    setHeadingMenu({ x: e.clientX, y: e.clientY, element: block as HTMLElement });
  }, [editMode, refs.contentRef]);

  /**
   * Sets the heading level for a specific element or the current menu element.
   */
  const handleSetHeading = useCallback(async (level: number | null, targetEl?: HTMLElement) => {
    const el = targetEl || headingMenu?.element;
    if (!el) return;
    const container = refs.contentRef.current;
    setHeadingMenu(null);
    if (!container) return;

    const text = el.textContent || "";
    const currentTag = el.tagName.toLowerCase();
    const targetTag = level ? `h${level}` : "p";

    if (currentTag === targetTag) return;

    const newEl = document.createElement(targetTag);
    newEl.textContent = text;
    el.replaceWith(newEl);

    const { saveSource, extractOutline, injectHeadingIds } = await import("@/lib/sources-storage");
    const updatedHtml = injectHeadingIds(container.innerHTML);
    const outline = extractOutline(updatedHtml);
    const { parseArticles } = await import("@/lib/article-parser");
    const articles = parseArticles(updatedHtml);

    const updated: Source = {
      ...source,
      htmlContent: updatedHtml,
      outline,
      articles,
      updatedAt: Date.now(),
    };
    await saveSource(updated);
    onSourceUpdated?.(updated);
    const { toast } = await import("sonner");
    toast.success(level ? `Postavljeno kao H${level}` : "Vraćeno na paragraf");
  }, [headingMenu, source, onSourceUpdated, refs.contentRef]);

  /**
   * Formats the current selection or block as a list.
   */
  const handleFormatAsList = useCallback(async (type: "ol" | "ul") => {
    const container = refs.contentRef.current;
    setHeadingMenu(null);
    if (!container) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const blocks: HTMLElement[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (["p", "div", "h1", "h2", "h3", "h4", "li"].includes(tag) && range.intersectsNode(el)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    let node: Node | null;
    while ((node = walker.nextNode())) blocks.push(node as HTMLElement);

    if (blocks.length === 0) return;

    const listEl = document.createElement(type);
    blocks[0].before(listEl);
    for (const block of blocks) {
      const li = document.createElement("li");
      li.innerHTML = block.innerHTML;
      listEl.appendChild(li);
      block.remove();
    }

    sel.removeAllRanges();

    const { saveSource, extractOutline, injectHeadingIds } = await import("@/lib/sources-storage");
    const updatedHtml = injectHeadingIds(container.innerHTML);
    const outline = extractOutline(updatedHtml);
    const { parseArticles } = await import("@/lib/article-parser");
    const articles = parseArticles(updatedHtml);

    const updated: Source = {
      ...source,
      htmlContent: updatedHtml,
      outline,
      articles,
      updatedAt: Date.now(),
    };
    await saveSource(updated);
    onSourceUpdated?.(updated);
    const { toast } = await import("sonner");
    toast.success(type === "ol" ? "Pretvoreno u numerisanu listu" : "Pretvoreno u listu");
  }, [source, onSourceUpdated, refs.contentRef]);

  /**
   * Formats the current selection as a specific tag (heading, paragraph, or list).
   */
  const handleFormatSelectionAs = useCallback(async (tag: "h1" | "h2" | "h3" | "p" | "ol" | "ul") => {
    if (tag === "ol" || tag === "ul") {
      await handleFormatAsList(tag);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const container = refs.contentRef.current;
    if (!container) return;

    const range = sel.getRangeAt(0);
    const blocks: HTMLElement[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as HTMLElement;
        const t = el.tagName.toLowerCase();
        if (["p", "div", "h1", "h2", "h3", "h4", "li"].includes(t) && range.intersectsNode(el)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    let node: Node | null;
    while ((node = walker.nextNode())) blocks.push(node as HTMLElement);

    if (blocks.length === 0) return;

    const level = tag === "p" ? null : parseInt(tag[1]);
    for (const block of blocks) {
      await handleSetHeading(level, block);
    }
    sel.removeAllRanges();
  }, [handleSetHeading, handleFormatAsList, refs.contentRef]);

  /**
   * Helper to open a card linked to the current source by navigating to its category.
   */
  const handleOpenCoveredCard = useCallback((cardId: string) => {
    sessionStorage.setItem("sr-scroll-to-card", cardId);
    window.location.hash = "#/categories";
  }, []);

  // Close heading menu on click elsewhere
  useEffect(() => {
    if (!headingMenu) return;
    const close = () => setHeadingMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [headingMenu]);

  const state = useMemo(() => ({
    ...baseState,
    editMode,
    readerWidth,
    headingMenu,
  }), [baseState, editMode, readerWidth, headingMenu]);

  const actions = useMemo(() => ({
    ...baseActions,
    setEditMode,
    setReaderWidth,
    setHeadingMenu,
    handleContextMenu,
    handleSetHeading,
    handleFormatAsList,
    handleFormatSelectionAs,
    handleOpenCoveredCard,
  }), [baseActions, handleContextMenu, handleSetHeading, handleFormatAsList, handleFormatSelectionAs, handleOpenCoveredCard]);

  return { state, actions, refs };
}
