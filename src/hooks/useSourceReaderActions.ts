import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useCardData, useCardOnlyActions } from "@/contexts/AppContext";
import { createTextAnchor, type Source } from "@/lib/sources-storage";
import { incrementDailyMapped } from "@/lib/planner-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { createSection } from "@/lib/spaced-repetition";
import { analyzeCoverage } from "@/lib/coverage-analysis";
import { splitSelection, firstWords, type SelectionModule } from "@/lib/selection-split-engine";
import { toast } from "sonner";
import { useSourceReaderStore } from "@/store/useSourceReaderStore";

/**
 * Side-effect actions hook for SourceReader.
 * Reads/writes to the Zustand store but depends on `source` prop and AppContext.
 */
export function useSourceReaderActions(source: Source, onSourceUpdated?: (source: Source) => void) {
  const { cards } = useCardData();
  const { addCard, patchCard } = useCardOnlyActions();
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
      // Extract HTML preserving formatting (bold, italic, lists, headings, paragraphs)
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
  // Unified flow: every "Convert to Essay" action routes through the
  // SmartSplit wizard so the user always gets the per-card preview before
  // committing to IDB. When the selection contains "Član X" markers we get
  // multiple modules; otherwise we synthesize a single module from the whole
  // selection (wizard handles N=1 gracefully).
  const handleConvertToEssay = useCallback(() => {
    const {
      selection, setSelection, setSplitResult, setSplitSummaryOpen,
      setSplitMode, initSplitWizard,
    } = useSourceReaderStore.getState();
    if (!selection) return;
    const text = selection.text;
    const html = selection.html;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const result = splitSelection(text);
    if (result.hasArticles && result.modules.length > 0) {
      setSplitResult({ modules: result.modules, rangeLabel: result.rangeLabel, parentName: result.parentName });
      initSplitWizard([...result.modules], result.parentName);
      setSplitMode("separate");
      setSplitSummaryOpen(true);
      return;
    }
    // No articles → synthesize a single module from the whole selection.
    const plainSnippet = text.trim();
    const safeHtml = sanitizeHtml(html || `<p>${text}</p>`);
    const fallbackTitle = firstWords(plainSnippet, 7) || "Esej iz izvora";
    const singleModule: SelectionModule = {
      articleNum: "",
      title: fallbackTitle,
      contentText: plainSnippet,
      contentHtml: safeHtml,
      plainSnippet,
    };
    setSplitResult({ modules: [singleModule], rangeLabel: fallbackTitle, parentName: fallbackTitle });
    initSplitWizard([singleModule], fallbackTitle);
    setSplitMode("separate"); // 1 modul → 1 kartica
    setSplitSummaryOpen(true);
  }, []);


  const handleSmartSplitConfirm = useCallback(async () => {
    const {
      splitResult, splitModules, splitEdits, splitParentName, splitMode,
      setSplitCreatedCount, setSplitDone,
    } = useSourceReaderStore.getState();
    if (!splitResult || splitModules.length === 0) return;
    const category = source.categoryId;
    const { buildSeparatePlans, buildCombinedPlan } = await import("@/lib/split-wizard-build");

    if (splitMode === "separate") {
      const plans = buildSeparatePlans(splitModules, splitEdits);
      if (plans.length === 0) {
        toast.error("Svi članovi su preskočeni — ništa za kreirati.");
        return;
      }
      for (const plan of plans) {
        const sections = [{ title: "Odgovor", content: sanitizeHtml(plan.module.contentHtml) }];
        const anchor = createTextAnchor(plan.module.plainSnippet);
        addCard(plan.question, sections, category, undefined, undefined, {
          sourceId: source.id,
          textAnchor: anchor,
          originalSourceSnippet: plan.module.plainSnippet,
          tags: plan.tags.length > 0 ? plan.tags : undefined,
        });
      }
      setSplitCreatedCount(plans.length);
      setSplitDone(true);
      incrementDailyMapped(plans.length);
      window.dispatchEvent(new CustomEvent("codex-mapping-created"));
      toast.success(`Generisano ${plans.length} kartica`, { description: `Iz "${source.title}"` });
      return;
    }

    // combined mode
    const plan = buildCombinedPlan(splitModules, splitEdits, splitParentName || splitResult.parentName);
    if (!plan) {
      toast.error("Svi članovi su preskočeni — ništa za kreirati.");
      return;
    }
    const sections = plan.modules.map(({ question, module: mod }) => ({
      title: question,
      content: sanitizeHtml(mod.contentHtml),
    }));
    const sourceModules = plan.modules.map(({ question, module: mod }, index) => ({
      id: crypto.randomUUID(),
      order: index,
      articleNum: mod.articleNum,
      title: question,
      question,
      textAnchor: createTextAnchor(mod.plainSnippet),
      originalSourceSnippet: mod.plainSnippet,
    }));
    const combinedSnippet = plan.modules.map(({ module: mod }) => mod.plainSnippet).join("\n\n");
    const anchor = createTextAnchor(combinedSnippet);
    addCard(plan.parentName, sections, category, undefined, undefined, {
      sourceId: source.id,
      textAnchor: anchor,
      originalSourceSnippet: combinedSnippet,
      childCardIds: sourceModules.map((m) => m.id),
      sourceModules,
      tags: plan.tags.length > 0 ? plan.tags : undefined,
    });
    setSplitCreatedCount(plan.modules.length);
    setSplitDone(true);
    incrementDailyMapped(plan.modules.length);
    window.dispatchEvent(new CustomEvent("codex-mapping-created"));
    toast.success(`Generisano 1 esej sa ${plan.modules.length} modula`, { description: `${splitResult.rangeLabel} iz "${source.title}"` });
  }, [source, addCard]);

  // ─── Link to existing ───
  const handleLinkToExisting = useCallback(() => {
    const { selection, setLinkSelectedText, setLinkSelectedHtml, setLinkModalOpen, setSelection } = useSourceReaderStore.getState();
    if (!selection) return;
    setLinkSelectedText(selection.text);
    setLinkSelectedHtml(selection.html);
    setLinkModalOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleLinkConfirm = useCallback((cardId: string, appendSnippet: boolean = true) => {
    const { linkSelectedText, linkSelectedHtml, setLinkModalOpen, setLinkSelectedText, setLinkSelectedHtml } = useSourceReaderStore.getState();
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
          createSection("Isječak iz izvora", sanitizeHtml(linkSelectedHtml || linkSelectedText)),
        ],
      };
    });
    setLinkModalOpen(false);
    setLinkSelectedText("");
    setLinkSelectedHtml("");
    toast.success("Esej uspješno povezan!", { description: `Povezano sa izvorom "${source.title}"` });
  }, [patchCard, source.id, source.title]);

  // ─── Exam mapping ───
  const handleMapSelection = useCallback((questionId: string) => {
    const { selection, examQuestions, setSelection, setExamQuestions } = useSourceReaderStore.getState();
    if (!selection) return;
    const text = selection.text;
    const html = selection.html;
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
      toast.success(`Esej kreiran: ${modules.length} modula`, { description: `${result.rangeLabel} → "${question.text.slice(0, 50)}..."` });
    } else {
      const anchor = createTextAnchor(text);
      // Use HTML for the rendered section (preserves formatting), keep plain for anchor & snippet.
      const sectionContent = sanitizeHtml(html || text);
      addCard(question.text, [{ title: "Odgovor", content: sectionContent }], category, undefined, undefined, {
        sourceId: source.id, textAnchor: anchor, originalSourceSnippet: text,
      });
      setExamQuestions(prev => prev.map(q => q.id === questionId ? { ...q, done: true, moduleCount: 1 } : q));
      incrementDailyMapped(1);
      toast.success("Esej kreiran", { description: `"${question.text.slice(0, 60)}..."` });
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

  // M3 fix: Close heading menu on click elsewhere — properly cleanup listener
  useEffect(() => {
    const store = useSourceReaderStore;
    let closeHandler: (() => void) | null = null;
    const unsub = store.subscribe((state, prev) => {
      if (state.headingMenu && !prev.headingMenu) {
        // Remove previous listener if it wasn't consumed
        if (closeHandler) window.removeEventListener("click", closeHandler);
        closeHandler = () => { store.getState().setHeadingMenu(null); closeHandler = null; };
        window.addEventListener("click", closeHandler, { once: true });
      } else if (!state.headingMenu && prev.headingMenu && closeHandler) {
        // Menu closed via other means (Escape, navigation) — cleanup dangling listener
        window.removeEventListener("click", closeHandler);
        closeHandler = null;
      }
    });
    return () => {
      unsub();
      if (closeHandler) window.removeEventListener("click", closeHandler);
    };
  }, []);

  // ─── Scroll to heading ───
  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ─── Navigate to covered card ───
  const handleOpenCoveredCard = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (card) {
      sessionStorage.setItem("sr-scroll-to-card", cardId);
      window.location.hash = `#/category/${card.categoryId}`;
    }
  }, [cards]);

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
        if (s.splitSummaryOpen) { s.setSplitSummaryOpen(false); s.setSplitResult(null); }
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

  // ─── Auto-format articles ───
  const handleAutoFormatArticles = useCallback(async () => {
    const { autoFormatArticles } = await import("@/lib/article-autoformat");
    const result = autoFormatArticles(source.htmlContent);
    if (result.count === 0) {
      toast.info("Nisu pronađeni članovi za formatiranje", { description: "Tražim pattern: \"Član X\"" });
      return;
    }
    const { saveSource, extractOutline, injectHeadingIds } = await import("@/lib/sources-storage");
    const updatedHtml = injectHeadingIds(result.html);
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
    toast.success(`Formatirano ${result.count} članova`, { description: "Članovi i nazivi su boldovani" });
  }, [source, onSourceUpdated]);

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
      handleAutoFormatArticles,
    },
  };
}
