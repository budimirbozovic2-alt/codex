import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from "react";













const AutoSplitDialog = lazy(() => import("@/components/AutoSplitDialog"));
import ExamSidebar, { type ExamQuestion } from "@/components/ExamSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/AppContext";
import { createTextAnchor, type Source } from "@/lib/sources-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { analyzeCoverage } from "@/lib/coverage-analysis";
import { splitSelection, type SelectionModule } from "@/lib/selection-split-engine";
import { cn } from "@/lib/utils";
import CoverageArticleList from "@/components/source-reader/CoverageArticleList";
import { ArrowLeft, Calendar, PenSquare, List, X, Eye, BarChart3, Wand2, FileQuestion, ChevronUp, ChevronDown, GripVertical, Pencil } from "lucide-react";

type ViewMode = "standard" | "coverage";

interface Props {
  source: Source;
  onBack: () => void;
}

// ── Compact Coverage Stats ──
function CoverageStatsBar({
  percent,
  linkedCount,
}: {
  percent: number;
  linkedCount: number;
}) {
  const barColor =
    percent >= 80 ? "bg-success" : percent >= 50 ? "bg-warning" : "bg-destructive";
  const color =
    percent >= 80 ? "text-success" : percent >= 50 ? "text-warning" : "text-destructive";

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
      <BarChart3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", barColor)}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <span className={cn("text-sm font-bold tabular-nums", color)}>{percent}%</span>
      <span className="text-xs text-muted-foreground">{linkedCount} kartica</span>
    </div>
  );
}

// ── Main Component ──
export default function SourceReader({ source, onBack }: Props) {
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
  // Smart-split summary state
  const [splitSummaryOpen, setSplitSummaryOpen] = useState(false);
  const [splitResult, setSplitResult] = useState<{ modules: SelectionModule[]; rangeLabel: string; parentName: string } | null>(null);
  const [splitDone, setSplitDone] = useState(false);
  const [splitCreatedCount, setSplitCreatedCount] = useState(0);
  const [splitParentName, setSplitParentName] = useState("");
  const [splitModules, setSplitModules] = useState<SelectionModule[]>([]);
  // Exam sidebar state
  const [examOpen, setExamOpen] = useState(false);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  // Coverage analysis (memoized)
  const coverage = useMemo(
    () => analyzeCoverage(source.id, source.htmlContent, cards),
    [source.id, source.htmlContent, cards]
  );

  // Re-sanitize HTML at read time to guard against corrupted IDB data
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
      // Find the correct container (contentRef for standard, coverage container)
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
      // Smart-split: show summary and auto-create
      setSplitResult(result);
      setSplitParentName(result.parentName);
      setSplitModules([...result.modules]);
      setSplitDone(false);
      setSplitCreatedCount(0);
      setSplitSummaryOpen(true);
    } else {
      // Fallback: single essay (no articles detected)
      setSelectedText(text);
      setEssayQuestion("");
      setEssayDialogOpen(true);
    }
  }, [selection]);

  const handleSmartSplitConfirm = useCallback(() => {
    if (!splitResult || splitModules.length === 0) return;
    const category = source.label || categories[0] || "Opšte";
    const modules = splitModules;
    const parentName = splitParentName.trim() || splitResult.parentName;

    const sections = modules.map((mod) => ({
      title: mod.title,
      content: sanitizeHtml(mod.contentHtml),
    }));

    const sourceModules = modules.map((mod, index) => ({
      id: crypto.randomUUID(),
      order: index,
      articleNum: mod.articleNum,
      title: mod.title,
      question: mod.title,
      textAnchor: createTextAnchor(mod.plainSnippet),
      originalSourceSnippet: mod.plainSnippet,
    }));

    const combinedSnippet = modules.map(m => m.plainSnippet).join("\n\n");
    const anchor = createTextAnchor(combinedSnippet);

    addCard(
      parentName,
      sections,
      category,
      undefined,
      undefined,
      {
        sourceId: source.id,
        textAnchor: anchor,
        originalSourceSnippet: combinedSnippet,
        childCardIds: sourceModules.map(m => m.id),
        sourceModules,
      }
    );

    setSplitCreatedCount(modules.length);
    setSplitDone(true);

    toast({
      title: `Generisano 1 esej sa ${modules.length} modula`,
      description: `${splitResult.rangeLabel} iz "${source.label}"`,
    });
  }, [splitResult, splitModules, splitParentName, source, categories, addCard]);

  const handleCreateEssay = useCallback(() => {
    if (!essayQuestion.trim() || !selectedText) return;

    const anchor = createTextAnchor(selectedText);
    addCard(
      essayQuestion.trim(),
      [{ title: "Odgovor", content: sanitizeHtml(selectedText) }],
      essayCategory,
      undefined,
      undefined,
      {
        sourceId: source.id,
        textAnchor: anchor,
        originalSourceSnippet: selectedText,
      }
    );

    toast({
      title: "Esejsko pitanje kreirano",
      description: `Povezano sa izvorom "${source.label}"`,
    });
    setEssayDialogOpen(false);
  }, [essayQuestion, selectedText, essayCategory, source, addCard]);

  const scrollToHeading = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleOpenCoveredCard = useCallback((cardId: string) => {
    sessionStorage.setItem("sr-scroll-to-card", cardId);
    sessionStorage.setItem("sr-database-tab", "cards");
    window.dispatchEvent(new CustomEvent("memoria-open-database-tab", { detail: "cards" }));
    onBack();
  }, [onBack]);

  // Exam sidebar: map selection to a question (silent save)
  const handleMapSelection = useCallback((questionId: string) => {
    if (!selection) return;
    const text = selection.text;
    const question = examQuestions.find(q => q.id === questionId);
    if (!question) return;

    // Clear selection UI
    setSelection(null);
    window.getSelection()?.removeAllRanges();

    const result = splitSelection(text);
    const category = source.label || categories[0] || "Opšte";

    if (result.hasArticles && result.modules.length > 0) {
      // Smart-split: auto-create with question text as parent name
      const { modules } = result;
      const sections = modules.map((mod) => ({
        title: mod.title,
        content: sanitizeHtml(mod.contentHtml),
      }));
      const sourceModules = modules.map((mod, index) => ({
        id: crypto.randomUUID(),
        order: index,
        articleNum: mod.articleNum,
        title: mod.title,
        question: mod.title,
        textAnchor: createTextAnchor(mod.plainSnippet),
        originalSourceSnippet: mod.plainSnippet,
      }));
      const combinedSnippet = modules.map(m => m.plainSnippet).join("\n\n");
      const anchor = createTextAnchor(combinedSnippet);

      addCard(
        question.text,
        sections,
        category,
        undefined,
        undefined,
        {
          sourceId: source.id,
          textAnchor: anchor,
          originalSourceSnippet: combinedSnippet,
          childCardIds: sourceModules.map(m => m.id),
          sourceModules,
        }
      );

      // Mark question as done
      setExamQuestions(prev =>
        prev.map(q => q.id === questionId ? { ...q, done: true, moduleCount: modules.length } : q)
      );

      toast({
        title: `Esej kreiran: ${modules.length} modula`,
        description: `${result.rangeLabel} → "${question.text.slice(0, 50)}..."`,
      });
    } else {
      // No articles detected — create single essay
      const anchor = createTextAnchor(text);
      addCard(
        question.text,
        [{ title: "Odgovor", content: sanitizeHtml(text) }],
        category,
        undefined,
        undefined,
        {
          sourceId: source.id,
          textAnchor: anchor,
          originalSourceSnippet: text,
        }
      );

      setExamQuestions(prev =>
        prev.map(q => q.id === questionId ? { ...q, done: true, moduleCount: 1 } : q)
      );

      toast({
        title: "Esej kreiran",
        description: `"${question.text.slice(0, 60)}..."`,
      });
    }
  }, [selection, examQuestions, source, categories, addCard]);

  const isCoverage = viewMode === "coverage";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-lg truncate">{source.label}</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {source.date}
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{source.version}</Badge>
          </div>
        </div>

        {/* Auto-split button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAutoSplitOpen(true)}
          className="gap-1.5"
          title="Generiši eseje iz članova"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Auto-Split
        </Button>

        {/* Mode toggle */}
        <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
          <button
            onClick={() => setViewMode("standard")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              !isCoverage ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Čitanje
          </button>
          <button
            onClick={() => setViewMode("coverage")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              isCoverage ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Pokrivenost
          </button>
        </div>

        <Button
          variant={examOpen ? "default" : "outline"}
          size="sm"
          onClick={() => setExamOpen(!examOpen)}
          className="gap-1.5"
          title="Ispitna pitanja sidebar"
        >
          <FileQuestion className="h-3.5 w-3.5" />
          {examOpen ? "Zatvori pitanja" : "Pitanja"}
          {examQuestions.filter(q => !q.done).length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 min-w-4 px-1">
              {examQuestions.filter(q => !q.done).length}
            </Badge>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setOutlineOpen(!outlineOpen)}
          className="gap-1.5"
        >
          {outlineOpen ? <X className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          {outlineOpen ? "Zatvori" : "Sadržaj"}
        </Button>
      </div>

      {/* Coverage stats bar */}
      {isCoverage && (
        <CoverageStatsBar
          percent={coverage.percent}
          linkedCount={linkedCount}
        />
      )}

      {/* Content area with optional outline */}
      <div className="flex gap-4">
        {/* Outline sidebar (standard mode only) */}
        {outlineOpen && source.outline.length > 0 && (
          <div className="w-56 flex-shrink-0 sticky top-20 self-start max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="rounded-lg border bg-card p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sadržaj</h4>
              <nav className="space-y-0.5">
                {source.outline.map(h => (
                  <button
                    key={h.id}
                    onClick={() => scrollToHeading(h.id)}
                    className="block w-full text-left text-xs py-1 px-2 rounded hover:bg-secondary transition-colors truncate text-muted-foreground hover:text-foreground"
                    style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                  >
                    {h.text}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 relative">
          {isCoverage ? (
            <CoverageArticleList
              source={source}
              cards={cards}
              onOpenCard={handleOpenCoveredCard}
            />
          ) : (
            <div
              ref={contentRef}
              className="rounded-lg border bg-card p-6 prose prose-sm max-w-none
                prose-headings:text-foreground prose-p:text-foreground/90
                prose-strong:text-foreground prose-a:text-primary
                prose-ul:text-foreground/90 prose-ol:text-foreground/90
                prose-li:text-foreground/90"
              onMouseUp={handleMouseUp}
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          )}

          {/* Selection tooltip */}
          {!isCoverage && selection && (
            <div
              data-source-tooltip
              className="absolute z-50 -translate-x-1/2 -translate-y-full animate-in fade-in-0 zoom-in-95 duration-150"
              style={{ left: selection.x, top: selection.y }}
            >
              <button
                onClick={handleConvertToEssay}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
              >
                <PenSquare className="h-3.5 w-3.5" />
                Pretvori u esej
              </button>
              <div className="w-2.5 h-2.5 bg-primary rotate-45 mx-auto -mt-1.5" />
            </div>
          )}
        </div>

        {/* Exam questions sidebar (right) */}
        {examOpen && (
          <ExamSidebar
            questions={examQuestions}
            onSetQuestions={setExamQuestions}
            onMapSelection={handleMapSelection}
            hasSelection={!!selection}
          />
        )}
      </div>

      {/* Essay creation dialog */}
      <Dialog open={essayDialogOpen} onOpenChange={setEssayDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kreiraj esejsko pitanje</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Pitanje</label>
              <textarea
                value={essayQuestion}
                onChange={e => setEssayQuestion(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-none"
                placeholder="Unesite pitanje za esej..."
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Označeni tekst (odgovor)</label>
              <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/50 p-3">
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedText}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Kategorija</label>
              <select
                value={essayCategory}
                onChange={e => setEssayCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Badge variant="outline" className="text-[10px]">Backlink</Badge>
              <span>Kartica će biti automatski povezana sa izvorom "{source.label}"</span>
            </div>

            <Button onClick={handleCreateEssay} disabled={!essayQuestion.trim()} className="w-full">
              Kreiraj esejsko pitanje
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Smart-Split Summary Dialog */}
      <Dialog open={splitSummaryOpen} onOpenChange={(o) => { if (!o) { setSplitSummaryOpen(false); setSplitResult(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              {splitDone ? "Generisanje završeno" : "Smart-Split pregled"}
            </DialogTitle>
          </DialogHeader>

          {splitDone ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4">
                <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <PenSquare className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Uspješno generisano 1 esejsko pitanje sa {splitCreatedCount} modula
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {splitResult?.rangeLabel} • Izvor: "{source.label}"
                  </p>
                </div>
              </div>
              <Button onClick={() => { setSplitSummaryOpen(false); setSplitResult(null); }} className="w-full">
                Zatvori
              </Button>
            </div>
          ) : splitResult ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium">Naslov eseja</label>
                <input
                  value={splitParentName}
                  onChange={e => setSplitParentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Unesite naslov eseja..."
                />
              </div>

              <div className="rounded-lg border bg-muted/50 px-4 py-3">
                <p className="text-sm">
                  Detektovano <strong className="text-foreground">{splitResult.modules.length}</strong> članova ({splitResult.rangeLabel})
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Biće kreiran 1 esejsko pitanje sa {splitResult.modules.length} modula (cjelina).
                </p>
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
                {splitModules.map((mod, i) => (
                  <div key={`${mod.articleNum}-${i}`} className="group flex items-start gap-1.5 rounded-md border bg-card px-2 py-2">
                    <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                      <button
                        disabled={i === 0}
                        onClick={() => setSplitModules(prev => {
                          const arr = [...prev];
                          [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                          return arr;
                        })}
                        className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors"
                        title="Pomjeri gore"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        disabled={i === splitModules.length - 1}
                        onClick={() => setSplitModules(prev => {
                          const arr = [...prev];
                          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                          return arr;
                        })}
                        className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors"
                        title="Pomjeri dolje"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <Badge variant="outline" className="text-[10px] mt-1 flex-shrink-0">
                      {i + 1}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <input
                        value={mod.title}
                        onChange={e => {
                          const val = e.target.value;
                          setSplitModules(prev => prev.map((m, j) => j === i ? { ...m, title: val } : m));
                        }}
                        className="w-full text-sm font-medium bg-transparent border-b border-transparent hover:border-border focus:border-ring focus:outline-none px-0 py-0.5 transition-colors"
                        title="Klikni za editovanje naslova"
                      />
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {mod.contentText.slice(0, 100)}{mod.contentText.length > 100 ? "..." : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                <Badge variant="outline" className="text-[10px]">Backlink</Badge>
                <span>Svi moduli će biti automatski povezani sa izvorom "{source.label}"</span>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setSplitSummaryOpen(false); setSplitResult(null); }} className="flex-1">
                  Otkaži
                </Button>
                <Button onClick={handleSmartSplitConfirm} className="flex-1 gap-2">
                  <Wand2 className="h-4 w-4" />
                  Potvrdi
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Auto-Split Dialog */}
      <Suspense fallback={null}>
        {autoSplitOpen && (
          <AutoSplitDialog
            open={autoSplitOpen}
            onClose={() => setAutoSplitOpen(false)}
            source={source}
          />
        )}
      </Suspense>
    </div>
  );
}
