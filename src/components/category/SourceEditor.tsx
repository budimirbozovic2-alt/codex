import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ArrowLeft, Save, Calendar as CalendarIcon, Scissors, Link2, Wand2, Maximize2, Minimize2, BookOpen, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import LinkToExistingCardModal from "@/components/LinkToExistingCardModal";
import { type Source } from "@/lib/db";
import { saveSource, createTextAnchor, extractOutline } from "@/lib/sources-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { splitSelection, type SelectionModule } from "@/lib/selection-split-engine";
import { incrementDailyMapped } from "@/lib/planner-storage";
import { createSection, type Card } from "@/lib/spaced-repetition";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AutoSplitDialog from "@/components/AutoSplitDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  source: Source;
  categoryId: string;
  cards: Card[];
  onBack: () => void;
  onSourceUpdated: (source: Source) => void;
  addCard: (...args: any[]) => void;
  patchCard: (id: string, fn: (c: Card) => Card) => void;
}

export default function SourceEditor({ source, categoryId, cards, onBack, onSourceUpdated, addCard, patchCard }: Props) {
  // Metadata state
  const [title, setTitle] = useState(source.title);
  const [slMarkings, setSlMarkings] = useState(source.slMarkings || "");
  const [dateStr, setDateStr] = useState(source.date);
  const [dateObj, setDateObj] = useState<Date | undefined>(source.date ? new Date(source.date) : undefined);
  const [isExclusive, setIsExclusive] = useState(source.isExclusive || false);
  const [dirty, setDirty] = useState(false);

  // Content / extraction state
  const contentRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [essayDialogOpen, setEssayDialogOpen] = useState(false);
  const [essayQuestion, setEssayQuestion] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSelectedText, setLinkSelectedText] = useState("");
  const [wide, setWide] = useState(false);
  const [autoSplitOpen, setAutoSplitOpen] = useState(false);

  // Cards linked to this source
  const linkedCards = useMemo(() => cards.filter(c => c.sourceId === source.id), [cards, source.id]);

  const outline = useMemo(() => extractOutline(source.htmlContent), [source.htmlContent]);
  const safeHtml = useMemo(() => sanitizeHtml(source.htmlContent), [source.htmlContent]);

  // Mark dirty on metadata changes
  useEffect(() => {
    if (title !== source.title || slMarkings !== (source.slMarkings || "") || dateStr !== source.date || isExclusive !== (source.isExclusive || false)) {
      setDirty(true);
    }
  }, [title, slMarkings, dateStr, isExclusive, source]);

  // Save metadata
  const handleSave = useCallback(async () => {
    const updated: Source = {
      ...source,
      title: title.trim() || source.title,
      slMarkings: slMarkings.trim() || undefined,
      date: dateStr,
      isExclusive,
      updatedAt: Date.now(),
    };
    await saveSource(updated);
    onSourceUpdated(updated);
    setDirty(false);
    toast({ title: "Izvor sačuvan", description: updated.title });
  }, [source, title, slMarkings, dateStr, isExclusive, onSourceUpdated]);

  // Text selection handler
  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length < 10) return;
      const range = sel.getRangeAt(0);
      const container = contentRef.current;
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

  // Dismiss selection on mousedown outside tooltip
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-source-tooltip]")) return;
      setSelection(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Smart Split — create new card with implicit categoryId
  const handleSmartSplit = useCallback(() => {
    if (!selection) return;
    const text = selection.text;
    setSelection(null);
    window.getSelection()?.removeAllRanges();

    const result = splitSelection(text);
    if (result.hasArticles && result.modules.length > 0) {
      // Multi-article split
      const { modules } = result;
      const sections = modules.map(mod => ({ title: mod.title, content: sanitizeHtml(mod.contentHtml) }));
      const sourceModules = modules.map((mod, i) => ({
        id: crypto.randomUUID(), order: i, articleNum: mod.articleNum,
        title: mod.title, question: mod.title,
        textAnchor: createTextAnchor(mod.plainSnippet),
        originalSourceSnippet: mod.plainSnippet,
      }));
      const combinedSnippet = modules.map(m => m.plainSnippet).join("\n\n");
      const anchor = createTextAnchor(combinedSnippet);
      addCard(result.parentName, sections, categoryId, undefined, undefined, {
        sourceId: source.id, textAnchor: anchor, originalSourceSnippet: combinedSnippet,
        childCardIds: sourceModules.map(m => m.id), sourceModules,
      });
      incrementDailyMapped(modules.length);
      toast({ title: `Generisano 1 esej sa ${modules.length} modula`, description: `${result.rangeLabel} iz "${source.title}"` });
    } else {
      // Single selection → open essay dialog
      setSelectedText(text);
      setEssayQuestion("");
      setEssayDialogOpen(true);
    }
  }, [selection, source, categoryId, addCard]);

  // Create single essay card
  const handleCreateEssay = useCallback(() => {
    if (!essayQuestion.trim() || !selectedText) return;
    const anchor = createTextAnchor(selectedText);
    addCard(essayQuestion.trim(), [{ title: "Odgovor", content: sanitizeHtml(selectedText) }], categoryId, undefined, undefined, {
      sourceId: source.id, textAnchor: anchor, originalSourceSnippet: selectedText,
    });
    toast({ title: "Esejsko pitanje kreirano", description: `Povezano sa izvorom "${source.title}"` });
    setEssayDialogOpen(false);
    incrementDailyMapped(1);
  }, [essayQuestion, selectedText, categoryId, source, addCard]);

  // Link to existing card
  const handleLinkToExisting = useCallback(() => {
    if (!selection) return;
    setLinkSelectedText(selection.text);
    setLinkModalOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [selection]);

  const handleLinkConfirm = useCallback((cardId: string, appendSnippet: boolean = true) => {
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
        sections: [...c.sections, createSection("Isječak iz izvora", sanitizeHtml(linkSelectedText))],
      };
    });
    setLinkModalOpen(false);
    setLinkSelectedText("");
    toast({ title: "Esej uspješno povezan!", description: `Povezano sa izvorom "${source.title}"` });
  }, [patchCard, source.id, source.title, linkSelectedText]);

  const scrollToHeading = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="space-y-4">
      {/* Back button + Save */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Nazad na listu
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutoSplitOpen(true)} className="gap-1.5">
            <Wand2 className="h-4 w-4" />
            Auto Split
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWide(w => !w)} className="gap-1.5">
            {wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {wide ? "Usko" : "Široko"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty} className="gap-2">
            <Save className="h-4 w-4" />
            Sačuvaj
          </Button>
        </div>
      </div>

      {/* Top Panel — Legal Metadata */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Metapodaci izvora</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="source-title">Naziv</Label>
            <Input id="source-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Puni naziv zakona..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source-sl">SL oznake</Label>
            <Input id="source-sl" value={slMarkings} onChange={e => setSlMarkings(e.target.value)} placeholder='Sl. list CG br. 40/2008...' />
          </div>
          <div className="space-y-1.5">
            <Label>Datum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateObj && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateObj ? format(dateObj, "PPP") : "Odaberi datum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateObj}
                  onSelect={(d) => { setDateObj(d); if (d) setDateStr(format(d, "yyyy-MM-dd")); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch id="exclusive" checked={isExclusive} onCheckedChange={setIsExclusive} />
            <Label htmlFor="exclusive" className="text-xs leading-tight cursor-pointer">
              Ovo je isključivi/glavni izvor za ovu kategoriju
            </Label>
          </div>
        </div>

        {source.officialGazetteInfo && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
            <span className="font-medium">Auto-detektovano:</span> {source.officialGazetteInfo}
          </div>
        )}
      </div>

      {/* Bottom Panel — Content + Outline */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* Outline sidebar */}
        {outline.length > 0 && (
          <div className="rounded-lg border bg-card p-3 hidden lg:block">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Sadržaj</h4>
            <ScrollArea className="h-[60vh]">
              <div className="space-y-0.5 pr-2">
                {outline.map(h => (
                  <button
                    key={h.id}
                    onClick={() => scrollToHeading(h.id)}
                    className="block w-full text-left text-xs truncate py-1 px-2 rounded hover:bg-accent/50 transition-colors text-foreground/80"
                    style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Content reader */}
        <div className="relative rounded-lg border bg-card">
          <ScrollArea className="h-[60vh]">
            <div
              ref={contentRef}
              className="prose prose-sm dark:prose-invert max-w-none p-4 md:p-6"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
              onMouseUp={handleMouseUp}
            />
          </ScrollArea>

          {/* Selection tooltip */}
          {selection && (
            <div
              data-source-tooltip
              className="absolute z-50 -translate-x-1/2 -translate-y-full animate-in fade-in-0 zoom-in-95 duration-150"
              style={{ left: selection.x, top: selection.y }}
            >
              <div className="flex items-center gap-1 mb-1">
                <button
                  onClick={handleSmartSplit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  Smart Split
                </button>
                <button
                  onClick={handleLinkToExisting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium shadow-lg hover:bg-secondary/80 transition-colors"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Poveži sa postojećim
                </button>
              </div>
              <div className="w-2.5 h-2.5 bg-primary rotate-45 mx-auto -mt-1.5" />
            </div>
          )}
        </div>
      </div>

      {/* Essay creation dialog */}
      <Dialog open={essayDialogOpen} onOpenChange={setEssayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kreiraj esejsko pitanje</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Pitanje</Label>
              <Input value={essayQuestion} onChange={e => setEssayQuestion(e.target.value)} placeholder="Unesite pitanje..." autoFocus />
            </div>
            <div className="rounded-md border bg-muted/50 p-2.5 max-h-32 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-1">Označeni tekst (odgovor):</p>
              <p className="text-xs text-foreground/80">{selectedText.slice(0, 500)}{selectedText.length > 500 ? "…" : ""}</p>
            </div>
            <div className="text-xs text-muted-foreground">
              Kategorija: <Badge variant="outline">{categoryId}</Badge> (automatski iz konteksta)
            </div>
            <Button onClick={handleCreateEssay} disabled={!essayQuestion.trim()} className="w-full">
              Kreiraj esej
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link to existing card modal */}
      <LinkToExistingCardModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        sourceId={source.id}
        sourceLabel={categoryId}
        selectedText={linkSelectedText}
        cards={cards}
        onLink={handleLinkConfirm}
      />
    </div>
  );
}
