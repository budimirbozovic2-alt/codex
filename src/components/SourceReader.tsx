import { PenSquare, BarChart3, Wand2, ChevronUp, ChevronDown, Link as LinkIcon } from "lucide-react";
import { lazy, Suspense, memo, useCallback } from "react";
import { useSourceLogic } from "@/hooks/useSourceLogic";
import { SourceToolbar } from "@/components/source-reader/SourceToolbar";
import ExamSidebar from "@/components/ExamSidebar";
import CoverageArticleList from "@/components/source-reader/CoverageArticleList";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/sources-storage";

const AutoSplitDialog = lazy(() => import("@/components/AutoSplitDialog"));

// ── Coverage Stats Bar ──
function CoverageStatsBar({ percent, linkedCount }: { percent: number; linkedCount: number }) {
  const barColor = percent >= 80 ? "bg-success" : percent >= 50 ? "bg-warning" : "bg-destructive";
  const color = percent >= 80 ? "text-success" : percent >= 50 ? "text-warning" : "text-destructive";
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
      <BarChart3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <span className={cn("text-sm font-bold tabular-nums", color)}>{percent}%</span>
      <span className="text-xs text-muted-foreground">{linkedCount} kartica</span>
    </div>
  );
}

// ── Memoized source content to avoid re-render on sidebar clicks ──
const SourceContent = memo(function SourceContent({ html, onMouseUp, contentRef }: { html: string; onMouseUp: () => void; contentRef: React.RefObject<HTMLDivElement> }) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const heading = target.closest("h1, h2, h3");
    if (heading && heading.id) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Inject link icons into headings after render
  const enhanceHeadings = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    (contentRef as React.MutableRefObject<HTMLDivElement>).current = node;
    node.querySelectorAll("h1[id], h2[id], h3[id]").forEach(h => {
      if (h.querySelector(".heading-link-icon")) return;
      const icon = document.createElement("span");
      icon.className = "heading-link-icon";
      icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
      h.appendChild(icon);
    });
  }, [contentRef]);

  return (
    <div
      ref={enhanceHeadings}
      className="rounded-lg border bg-card p-6 prose prose-sm max-w-none
        prose-headings:text-foreground prose-headings:cursor-pointer prose-headings:hover:text-primary prose-headings:transition-colors
        prose-p:text-foreground/90
        prose-strong:text-foreground prose-a:text-primary
        prose-ul:text-foreground/90 prose-ol:text-foreground/90
        prose-li:text-foreground/90
        [&_h1[id]]:relative [&_h1[id]]:group [&_h2[id]]:relative [&_h2[id]]:group [&_h3[id]]:relative [&_h3[id]]:group
        [&_.heading-link-icon]:inline-flex [&_.heading-link-icon]:items-center [&_.heading-link-icon]:ml-2
        [&_.heading-link-icon]:text-muted-foreground/40 [&_.heading-link-icon]:opacity-0
        [&_h1:hover_.heading-link-icon]:opacity-100 [&_h2:hover_.heading-link-icon]:opacity-100 [&_h3:hover_.heading-link-icon]:opacity-100
        [&_.heading-link-icon]:transition-opacity [&_.heading-link-icon]:duration-200"
      onMouseUp={onMouseUp}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

interface Props {
  source: Source;
  onBack: () => void;
}

export default function SourceReader({ source, onBack }: Props) {
  const logic = useSourceLogic(source);
  const isCoverage = logic.viewMode === "coverage";

  const handleOpenCoveredCard = (cardId: string) => {
    sessionStorage.setItem("sr-scroll-to-card", cardId);
    sessionStorage.setItem("sr-database-tab", "cards");
    window.dispatchEvent(new CustomEvent("memoria-open-database-tab", { detail: "cards" }));
    onBack();
  };

  return (
    <div className="space-y-4">
      <SourceToolbar
        source={source}
        onBack={onBack}
        viewMode={logic.viewMode}
        setViewMode={logic.setViewMode}
        examOpen={logic.examOpen}
        setExamOpen={logic.setExamOpen}
        examQuestions={logic.examQuestions}
        outlineOpen={logic.outlineOpen}
        setOutlineOpen={logic.setOutlineOpen}
        onAutoSplit={() => logic.setAutoSplitOpen(true)}
      />

      {isCoverage && <CoverageStatsBar percent={logic.coverage.percent} linkedCount={logic.linkedCount} />}

      <div className="flex gap-4">
        {logic.outlineOpen && source.outline.length > 0 && (
          <div className="w-56 flex-shrink-0 sticky top-20 self-start max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="rounded-lg border bg-card p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sadržaj</h4>
              <nav className="space-y-0.5">
                {source.outline.map(h => (
                  <button key={h.id} onClick={() => logic.scrollToHeading(h.id)}
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

        <div className="flex-1 min-w-0 relative">
          {isCoverage ? (
            <CoverageArticleList source={source} cards={logic.cards} onOpenCard={handleOpenCoveredCard} />
          ) : (
            <SourceContent html={logic.safeHtml} onMouseUp={logic.handleMouseUp} contentRef={logic.contentRef} />
          )}

          {!isCoverage && logic.selection && (
            <div data-source-tooltip
              className="absolute z-50 -translate-x-1/2 -translate-y-full animate-in fade-in-0 zoom-in-95 duration-150"
              style={{ left: logic.selection.x, top: logic.selection.y }}>
              <button onClick={logic.handleConvertToEssay}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
                title="Prečica: S">
                <PenSquare className="h-3.5 w-3.5" />
                Pretvori u esej
                <kbd className="text-[9px] opacity-70 ml-0.5 border border-primary-foreground/30 rounded px-1">S</kbd>
              </button>
              <div className="w-2.5 h-2.5 bg-primary rotate-45 mx-auto -mt-1.5" />
            </div>
          )}
        </div>

        {logic.examOpen && (
          <ExamSidebar
            questions={logic.examQuestions}
            onSetQuestions={logic.setExamQuestions}
            onMapSelection={logic.handleMapSelection}
            hasSelection={!!logic.selection}
          />
        )}
      </div>

      {/* Essay creation dialog */}
      <Dialog open={logic.essayDialogOpen} onOpenChange={logic.setEssayDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Kreiraj esejsko pitanje</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Pitanje</label>
              <textarea value={logic.essayQuestion} onChange={e => logic.setEssayQuestion(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-none"
                placeholder="Unesite pitanje za esej..." autoFocus />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Označeni tekst (odgovor)</label>
              <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/50 p-3">
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{logic.selectedText}</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Kategorija</label>
              <select value={logic.essayCategory} onChange={e => logic.setEssayCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {logic.categories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Badge variant="outline" className="text-[10px]">Backlink</Badge>
              <span>Kartica će biti automatski povezana sa izvorom "{source.label}"</span>
            </div>
            <Button onClick={logic.handleCreateEssay} disabled={!logic.essayQuestion.trim()} className="w-full">
              Kreiraj esejsko pitanje
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Smart-Split Summary Dialog */}
      <Dialog open={logic.splitSummaryOpen} onOpenChange={(o) => { if (!o) { logic.setSplitSummaryOpen(false); logic.setSplitResult(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              {logic.splitDone ? "Generisanje završeno" : "Smart-Split pregled"}
            </DialogTitle>
          </DialogHeader>
          {logic.splitDone ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4">
                <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <PenSquare className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Uspješno generisano 1 esejsko pitanje sa {logic.splitCreatedCount} modula</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{logic.splitResult?.rangeLabel} • Izvor: "{source.label}"</p>
                </div>
              </div>
              <Button onClick={() => { logic.setSplitSummaryOpen(false); logic.setSplitResult(null); }} className="w-full">Zatvori</Button>
            </div>
          ) : logic.splitResult ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium">Naslov eseja</label>
                <input value={logic.splitParentName} onChange={e => logic.setSplitParentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Unesite naslov eseja..." />
              </div>
              <div className="rounded-lg border bg-muted/50 px-4 py-3">
                <p className="text-sm">Detektovano <strong className="text-foreground">{logic.splitResult.modules.length}</strong> članova ({logic.splitResult.rangeLabel})</p>
                <p className="text-xs text-muted-foreground mt-1">Biće kreiran 1 esejsko pitanje sa {logic.splitResult.modules.length} modula (cjelina).</p>
              </div>
              <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
                {logic.splitModules.map((mod, i) => (
                  <div key={`${mod.articleNum}-${i}`} className="group flex items-start gap-1.5 rounded-md border bg-card px-2 py-2">
                    <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                      <button disabled={i === 0}
                        onClick={() => logic.setSplitModules(prev => { const arr = [...prev]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return arr; })}
                        className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors" title="Pomjeri gore">
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button disabled={i === logic.splitModules.length - 1}
                        onClick={() => logic.setSplitModules(prev => { const arr = [...prev]; [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; return arr; })}
                        className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors" title="Pomjeri dolje">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <Badge variant="outline" className="text-[10px] mt-1 flex-shrink-0">{i + 1}</Badge>
                    <div className="min-w-0 flex-1">
                      <input value={mod.title}
                        onChange={e => { const val = e.target.value; logic.setSplitModules(prev => prev.map((m, j) => j === i ? { ...m, title: val } : m)); }}
                        className="w-full text-sm font-medium bg-transparent border-b border-transparent hover:border-border focus:border-ring focus:outline-none px-0 py-0.5 transition-colors"
                        title="Klikni za editovanje naslova" />
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
                <Button variant="outline" onClick={() => { logic.setSplitSummaryOpen(false); logic.setSplitResult(null); }} className="flex-1">Otkaži</Button>
                <Button onClick={logic.handleSmartSplitConfirm} className="flex-1 gap-2">
                  <Wand2 className="h-4 w-4" />Potvrdi
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        {logic.autoSplitOpen && (
          <AutoSplitDialog open={logic.autoSplitOpen} onClose={() => logic.setAutoSplitOpen(false)} source={source} />
        )}
      </Suspense>
    </div>
  );
}
