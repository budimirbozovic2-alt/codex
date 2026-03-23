import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as Calendar } from "lucide-react/dist/esm/icons/calendar";
import { default as PenSquare } from "lucide-react/dist/esm/icons/pen-square";
import { default as List } from "lucide-react/dist/esm/icons/list";
import { default as X } from "lucide-react/dist/esm/icons/x";
import { default as Eye } from "lucide-react/dist/esm/icons/eye";
import { default as BarChart3 } from "lucide-react/dist/esm/icons/bar-chart-3";
import { default as Wand2 } from "lucide-react/dist/esm/icons/wand-2";

const AutoSplitDialog = lazy(() => import("@/components/AutoSplitDialog"));
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
  // Coverage analysis (memoized)
  const coverage = useMemo(
    () => analyzeCoverage(source.id, source.htmlContent, cards),
    [source.id, source.htmlContent, cards]
  );

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
      if (target.closest("[data-source-tooltip]")) return;
      setSelection(null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const handleConvertToEssay = useCallback(() => {
    if (!selection) return;
    setSelectedText(selection.text);
    setEssayQuestion("");
    setEssayDialogOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [selection]);

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
              dangerouslySetInnerHTML={{ __html: source.htmlContent }}
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
      </div>

      {/* Essay creation dialog */}
      <Dialog open={essayDialogOpen} onOpenChange={setEssayDialogOpen}>
        <DialogContent className="max-w-lg">
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
