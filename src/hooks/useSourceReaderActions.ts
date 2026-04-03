import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useCardData, useCardActions } from "@/contexts/AppContext";
import { createTextAnchor, type Source } from "@/lib/sources-storage";
import { incrementDailyMapped } from "@/lib/planner-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { createSection } from "@/lib/spaced-repetition";
import { analyzeCoverage } from "@/lib/coverage-analysis";
import { splitSelection } from "@/lib/selection-split-engine";
import { toast } from "sonner";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";

/**
 * Side-effect actions hook for SourceReader.
 * Reads/writes to the Zustand store but depends on `source` prop and AppContext.
 */
export function useSourceReaderActions(source: Source, onSourceUpdated?: (source: Source) => void) {
  const { cards } = useCardData();
  const { addCard, patchCard } = useCardActions();
  const contentRef = useRef<HTMLDivElement>(null);

  // Derived data (depends on source + cards from AppContext)
  const sourceCards = useMemo(
    () => cards.filter(c => c.sourceId === source.id),
    [cards, source.id]
  );

  const coverage = useMemo(
    () => analyzeCoverage(source.id, source.htmlContent, sourceCards),
    [source.id, source.htmlContent, sourceCards]
  );

  const safeHtml = useMemo(() => sanitizeHtml(source.htmlContent), [source.htmlContent]);
  const linkedCount = sourceCards.length;

  // ─── Mouse handlers ───
  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length < 10) return;
      const range = sel.getRangeAt(0);
      const container = contentRef.current || document.querySelector("[data-coverage-container]");
      if (!container || !container.contains(range.commonAncestorContainer)) return;
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      useSourceReaderStore.getState().setSelection({
        text,
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
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

  // ─── Essay / Split ───
  const handleConvertToEssay = useCallback(() => {
    const { selection, setSelection, setSplitResult, setSplitParentName, setSplitModules, setSplitDone, setSplitCreatedCount, setSplitSummaryOpen, setSelectedText, setEssayQuestion, setEssayDialogOpen } = useSourceReaderStore.getState();
    if (!selection) return;
    const text = selection.text;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const result = splitSelection(text);
    if (result.hasArticles && result.modules.length > 0) {
      setSplitResult(result);
      setSplitParentName(result.parentName);
      setSplitModules([...result.modules]);
      setSplitDone(false);
      setSplitCreatedCount(0);
      setSplitSummaryOpen(true);
    } else {
      setSelectedText(text);
      setEssayQuestion("");
      setEssayDialogOpen(true);
    }
  }, []);

  const handleCreateEssay = useCallback(() => {
    const { essayQuestion, selectedText, setEssayDialogOpen } = useSourceReaderStore.getState();
    if (!essayQuestion.trim() || !selectedText) return;
    const anchor = createTextAnchor(selectedText);
    addCard(essayQuestion.trim(), [{ title: "Odgovor", content: sanitizeHtml(selectedText) }], source.categoryId, undefined, undefined, {
      sourceId: source.id, textAnchor: anchor, originalSourceSnippet: selectedText,
    });
    toast.success("Esejsko pitanje kreirano", { description: `Povezano sa izvorom "${source.title}"` });
    setEssayDialogOpen(false);
    incrementDailyMapped(1);
  }, [source, addCard]);

  const handleSmartSplitConfirm = useCallback(() => {
    const { splitResult, splitModules, splitParentName, setSplitCreatedCount, setSplitDone } = useSourceReaderStore.getState();
    if (!splitResult || splitModules.length === 0) return;
    const category = source.categoryId;
    const modules = splitModules;
    const parentName = splitParentName.trim() || splitResult.parentName;
    const sections = modules.map((mod) => ({ title: mod.title, content: sanitizeHtml(mod.contentHtml) }));
    const sourceModules = modules.map((mod, index) => ({
      id: crypto.randomUUID(), order: index, articleNum: mod.articleNum,
      title: mod.title, question: mod.title,
      textAnchor: createTextAnchor(mod.plainSnippet),
      originalSourceSnippet: mod.plainSnippet,
    }));
    const combinedSnippet = modules.map(m => m.plainSnippet).join("\n\n");
    const anchor = createTextAnchor(combinedSnippet);
    addCard(parentName, sections, category, undefined, undefined, {
      sourceId: source.id, textAnchor: anchor, originalSourceSnippet: combinedSnippet,
      childCardIds: sourceModules.map(m => m.id), sourceModules,
    });
    setSplitCreatedCount(modules.length);
    setSplitDone(true);
    incrementDailyMapped(modules.length);
    window.dispatchEvent(new CustomEvent("codex-mapping-created"));
    toast({ title: `Generisano 1 esej sa ${modules.length} modula`, description: `${splitResult.rangeLabel} iz "${source.title}"` });
  }, [source, addCard]);

  // ─── Link to existing ───
  const handleLinkToExisting = useCallback(() => {
    const { selection, setLinkSelectedText, setLinkModalOpen, setSelection } = useSourceReaderStore.getState();
    if (!selection) return;
    setLinkSelectedText(selection.text);
    setLinkModalOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleLinkConfirm = useCallback((cardId: string, appendSnippet: boolean = true) => {
    const { linkSelectedText, setLinkModalOpen, setLinkSelectedText } = useSourceReaderStore.getState();
    patchCard(cardId, (c) => {
      const base = {
        ...c,
        sourceId: source.id,
        textAnchor: createTextAnchor(linkSelectedText),
        originalSourceSnippet: linkSelectedText,
      };
      if (!appendSnippet) return base;
      return {
        ...base,
        sections: [
          ...c.sections,
          createSection("Isječak iz izvora", sanitizeHtml(linkSelectedText)),
        ],
      };
    });
    setLinkModalOpen(false);
    setLinkSelectedText("");
    toast({ title: "Esej uspješno povezan!", description: `Povezano sa izvorom "${source.title}"` });
  }, [patchCard, source.id, source.title]);

  // ─── Exam mapping ───
  const handleMapSelection = useCallback((questionId: string) => {
    const { selection, examQuestions, setSelection, setExamQuestions } = useSourceReaderStore.getState();
    if (!selection) return;
    const text = selection.text;
    const question = examQuestions.find(q => q.id === questionId);
    if (!question) return;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const result = splitSelection(text);
    const category = source.categoryId;
    if (result.hasArticles && result.modules.length > 0) {
      const { modules } = result;
      const sections = modules.map((mod) => ({ title: mod.title, content: sanitizeHtml(mod.contentHtml) }));
      const sourceModules = modules.map((mod, index) => ({
        id: crypto.randomUUID(), order: index, articleNum: mod.articleNum,
        title: mod.title, question: mod.title,
        textAnchor: createTextAnchor(mod.plainSnippet),
        originalSourceSnippet: mod.plainSnippet,
      }));
      const combinedSnippet = modules.map(m => m.plainSnippet).join("\n\n");
      const anchor = createTextAnchor(combinedSnippet);
      addCard(question.text, sections, category, undefined, undefined, {
        sourceId: source.id, textAnchor: anchor, originalSourceSnippet: combinedSnippet,
        childCardIds: sourceModules.map(m => m.id), sourceModules,
      });
      setExamQuestions(prev => prev.map(q => q.id === questionId ? { ...q, done: true, moduleCount: modules.length } : q));
      incrementDailyMapped(modules.length);
      toast({ title: `Esej kreiran: ${modules.length} modula`, description: `${result.rangeLabel} → "${question.text.slice(0, 50)}..."` });
    } else {
      const anchor = createTextAnchor(text);
      addCard(question.text, [{ title: "Odgovor", content: sanitizeHtml(text) }], category, undefined, undefined, {
        sourceId: source.id, textAnchor: anchor, originalSourceSnippet: text,
      });
      setExamQuestions(prev => prev.map(q => q.id === questionId ? { ...q, done: true, moduleCount: 1 } : q));
      incrementDailyMapped(1);
      toast({ title: "Esej kreiran", description: `"${question.text.slice(0, 60)}..."` });
    }
  }, [source, addCard]);

  // ─── Heading / formatting (edit mode) ───
  const handleSetHeading = useCallback(async (level: number | null, targetEl?: HTMLElement) => {
    const el = targetEl || useSourceReaderStore.getState().headingMenu?.element;
    if (!el) return;
    const container = contentRef.current;
    useSourceReaderStore.getState().setHeadingMenu(null);
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
    const { toast: sonnerToast } = await import("sonner");
    sonnerToast.success(level ? `Postavljeno kao H${level}` : "Vraćeno na paragraf");
  }, [source, onSourceUpdated]);

  const handleFormatAsList = useCallback(async (type: "ol" | "ul") => {
    const container = contentRef.current;
    useSourceReaderStore.getState().setHeadingMenu(null);
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
    const { toast: sonnerToast } = await import("sonner");
    sonnerToast.success(type === "ol" ? "Pretvoreno u numerisanu listu" : "Pretvoreno u listu");
  }, [source, onSourceUpdated]);

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
  }, [handleSetHeading, handleFormatAsList]);

  // ─── Context menu ───
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!useSourceReaderStore.getState().editMode) return;
    const target = e.target as HTMLElement;
    const block = target.closest("p, h1, h2, h3, h4, li, ol, ul, div");
    if (!block) return;
    const container = contentRef.current;
    if (!container || !container.contains(block)) return;
    e.preventDefault();
    useSourceReaderStore.getState().setHeadingMenu({ x: e.clientX, y: e.clientY, element: block as HTMLElement });
  }, []);

  // Close heading menu on click elsewhere
  useEffect(() => {
    const store = useSourceReaderStore;
    const unsub = store.subscribe((state, prev) => {
      if (state.headingMenu && !prev.headingMenu) {
        const close = () => store.getState().setHeadingMenu(null);
        window.addEventListener("click", close, { once: true });
      }
    });
    return unsub;
  }, []);

  // ─── Scroll to heading ───
  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ─── Navigate to covered card ───
  const handleOpenCoveredCard = useCallback((cardId: string) => {
    sessionStorage.setItem("sr-scroll-to-card", cardId);
    window.location.hash = "#/categories";
  }, []);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const s = useSourceReaderStore.getState();
      if (e.key === "s" || e.key === "S") {
        if (s.selection && !s.editMode) { e.preventDefault(); handleConvertToEssay(); }
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        s.setExamOpen(!s.examOpen);
      } else if (e.key === "Escape") {
        if (s.essayDialogOpen) s.setEssayDialogOpen(false);
        else if (s.splitSummaryOpen) { s.setSplitSummaryOpen(false); s.setSplitResult(null); }
        else if (s.autoSplitOpen) s.setAutoSplitOpen(false);
        else if (s.selection) s.setSelection(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleConvertToEssay]);

  // ─── Inline format (edit mode) ───
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
  }, []);

  // ─── Debounced auto-save (edit mode) ───
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistContent = useCallback(async () => {
    const container = contentRef.current;
    if (!container) return;
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
  }, [source, onSourceUpdated]);

  const handleEditInput = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistContent();
    }, 1000);
  }, [persistContent]);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  return {
    contentRef,
    derived: { sourceCards, coverage, safeHtml, linkedCount, cards },
    actions: {
      handleMouseUp,
      handleConvertToEssay,
      handleCreateEssay,
      handleSmartSplitConfirm,
      handleLinkToExisting,
      handleLinkConfirm,
      handleMapSelection,
      handleSetHeading,
      handleFormatAsList,
      handleFormatSelectionAs,
      handleContextMenu,
      scrollToHeading,
      handleOpenCoveredCard,
      handleInlineFormat,
      handleEditInput,
    },
  };
}
