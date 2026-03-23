import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { createTextAnchor, type Source } from "@/lib/sources-storage";
import { incrementDailyMapped } from "@/lib/planner-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { analyzeCoverage } from "@/lib/coverage-analysis";
import { splitSelection, type SelectionModule } from "@/lib/selection-split-engine";
import { toast } from "@/hooks/use-toast";
import type { ExamQuestion } from "@/components/ExamSidebar";

type ViewMode = "standard" | "coverage";

export function useSourceLogic(source: Source) {
  const { addCard, categories, cards } = useAppContext();
  const contentRef = useRef<HTMLDivElement>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [essayDialogOpen, setEssayDialogOpen] = useState(false);
  const [essayQuestion, setEssayQuestion] = useState("");
  const [essayCategory, setEssayCategory] = useState(categories[0] ?? "Opšte");
  const [selectedText, setSelectedText] = useState("");
  const [autoSplitOpen, setAutoSplitOpen] = useState(false);
  const [splitSummaryOpen, setSplitSummaryOpen] = useState(false);
  const [splitResult, setSplitResult] = useState<{ modules: SelectionModule[]; rangeLabel: string; parentName: string } | null>(null);
  const [splitDone, setSplitDone] = useState(false);
  const [splitCreatedCount, setSplitCreatedCount] = useState(0);
  const [splitParentName, setSplitParentName] = useState("");
  const [splitModules, setSplitModules] = useState<SelectionModule[]>([]);
  const [examOpen, setExamOpen] = useState(false);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);

  const coverage = useMemo(
    () => analyzeCoverage(source.id, source.htmlContent, cards),
    [source.id, source.htmlContent, cards]
  );

  const safeHtml = useMemo(() => sanitizeHtml(source.htmlContent), [source.htmlContent]);

  const linkedCount = useMemo(
    () => cards.filter(c => c.sourceId === source.id).length,
    [cards, source.id]
  );

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
      setSelection({
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
      setSelection(null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const handleConvertToEssay = useCallback(() => {
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
  }, [selection]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "s" || e.key === "S") {
        if (selection) { e.preventDefault(); handleConvertToEssay(); }
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setExamOpen(prev => !prev);
      } else if (e.key === "Escape") {
        if (essayDialogOpen) setEssayDialogOpen(false);
        else if (splitSummaryOpen) { setSplitSummaryOpen(false); setSplitResult(null); }
        else if (autoSplitOpen) setAutoSplitOpen(false);
        else if (selection) setSelection(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection, handleConvertToEssay, essayDialogOpen, splitSummaryOpen, autoSplitOpen]);

  const handleSmartSplitConfirm = useCallback(() => {
    if (!splitResult || splitModules.length === 0) return;
    const category = source.label || categories[0] || "Opšte";
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
    toast({ title: `Generisano 1 esej sa ${modules.length} modula`, description: `${splitResult.rangeLabel} iz "${source.label}"` });
  }, [splitResult, splitModules, splitParentName, source, categories, addCard]);

  const handleCreateEssay = useCallback(() => {
    if (!essayQuestion.trim() || !selectedText) return;
    const anchor = createTextAnchor(selectedText);
    addCard(essayQuestion.trim(), [{ title: "Odgovor", content: sanitizeHtml(selectedText) }], essayCategory, undefined, undefined, {
      sourceId: source.id, textAnchor: anchor, originalSourceSnippet: selectedText,
    });
    toast({ title: "Esejsko pitanje kreirano", description: `Povezano sa izvorom "${source.label}"` });
    setEssayDialogOpen(false);
    incrementDailyMapped(1);
  }, [essayQuestion, selectedText, essayCategory, source, addCard]);

  const scrollToHeading = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleMapSelection = useCallback((questionId: string) => {
    if (!selection) return;
    const text = selection.text;
    const question = examQuestions.find(q => q.id === questionId);
    if (!question) return;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const result = splitSelection(text);
    const category = source.label || categories[0] || "Opšte";
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
  }, [selection, examQuestions, source, categories, addCard]);

  return {
    contentRef, outlineOpen, setOutlineOpen, viewMode, setViewMode,
    selection, essayDialogOpen, setEssayDialogOpen, essayQuestion, setEssayQuestion,
    essayCategory, setEssayCategory, selectedText, autoSplitOpen, setAutoSplitOpen,
    splitSummaryOpen, setSplitSummaryOpen, splitResult, setSplitResult,
    splitDone, splitCreatedCount, splitParentName, setSplitParentName,
    splitModules, setSplitModules, examOpen, setExamOpen, examQuestions, setExamQuestions,
    coverage, safeHtml, linkedCount, cards, categories,
    handleMouseUp, handleConvertToEssay, handleSmartSplitConfirm, handleCreateEssay,
    scrollToHeading, handleMapSelection,
  };
}
