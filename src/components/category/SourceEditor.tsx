import { useState, useCallback, useEffect, useRef } from "react";
import { Save, Calendar as CalendarIcon, FileUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { type Source, db } from "@/lib/db";
import { saveSource, extractOutline } from "@/lib/sources-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { injectHeadingIds } from "@/lib/sources-storage";
import { parseArticles, compareVersions, getChangedArticleIds, matchAnchorToArticle } from "@/lib/article-parser";
import { parseDocxInWorker } from "@/lib/docx-parser";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import SourceDiffPreview from "@/components/source-reader/SourceDiffPreview";

interface Props {
  source: Source;
  categoryId: string;
  onClose: () => void;
  onSourceUpdated: (source: Source) => void;
  bulkFlagNeedsReview?: (cardIds: string[]) => void;
}

export default function SourceEditor({ source, categoryId, onClose, onSourceUpdated, bulkFlagNeedsReview }: Props) {
  const [title, setTitle] = useState(source.title);
  const [slMarkings, setSlMarkings] = useState(source.slMarkings || "");
  const [dateStr, setDateStr] = useState(source.date);
  const [dateObj, setDateObj] = useState<Date | undefined>(source.date ? new Date(source.date) : undefined);
  const [isExclusive, setIsExclusive] = useState(source.isExclusive || false);
  const [dirty, setDirty] = useState(false);

  // Update source text
  const [newText, setNewText] = useState("");
  const [textOpen, setTextOpen] = useState(false);

  // DOCX upload
  const [docxParsing, setDocxParsing] = useState(false);
  const [docxFileName, setDocxFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Diff preview
  const [diffPending, setDiffPending] = useState<{
    diffResult: import("@/lib/article-parser").DiffResult;
    affectedCardIds: string[];
    updatedSource: Source;
  } | null>(null);

  useEffect(() => {
    if (title !== source.title || slMarkings !== (source.slMarkings || "") || dateStr !== source.date || isExclusive !== (source.isExclusive || false)) {
      setDirty(true);
    }
  }, [title, slMarkings, dateStr, isExclusive, source]);

  // ─── DOCX file handling ───────────────────────────────
  const handleDocxFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".docx")) {
      toast({ title: "Pogrešan format", description: "Podržani su samo .docx fajlovi." });
      return;
    }
    setDocxParsing(true);
    setDocxFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const html = await parseDocxInWorker(arrayBuffer);
      setNewText(html);
      setDirty(true);
      toast({ title: "DOCX učitan", description: `${file.name} uspješno parsiran.` });
    } catch (err: any) {
      toast({ title: "Greška pri parsiranju", description: err?.message || "Neuspješno čitanje DOCX fajla." });
    } finally {
      setDocxParsing(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleDocxFile(file);
  }, [handleDocxFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // ─── Save with diff check ────────────────────────────
  const handleSave = useCallback(async () => {
    let htmlContent = source.htmlContent;
    let outline = source.outline;
    let articles = source.articles;

    // If user pasted new text, update HTML
    if (newText.trim()) {
      const cleanHtml = sanitizeHtml(newText);
      const { promoteHeadings } = await import("@/lib/heading-promotion");
      const promotedHtml = promoteHeadings(cleanHtml);
      htmlContent = injectHeadingIds(promotedHtml);
      outline = extractOutline(htmlContent);
      articles = parseArticles(htmlContent);

      // Run diff and check for affected cards
      if (source.htmlContent && bulkFlagNeedsReview) {
        const diffResult = compareVersions(source.htmlContent, htmlContent);
        const changedIds = getChangedArticleIds(diffResult);

        if (changedIds.size > 0) {
          // Find cards linked to this source with anchors in changed articles
          const linkedCards = await db.cards.where("sourceId").equals(source.id).toArray();
          const oldArticles = parseArticles(source.htmlContent);
          const affectedCardIds: string[] = [];

          for (const card of linkedCards) {
            if (card.textAnchor) {
              const articleId = matchAnchorToArticle(card.textAnchor, oldArticles);
              if (articleId && changedIds.has(articleId)) {
                affectedCardIds.push(card.id);
              }
            }
          }

          // Show diff preview if there are changes
          if (diffResult.summary.modified > 0 || diffResult.summary.added > 0 || diffResult.summary.removed > 0) {
            const updated: Source = {
              ...source,
              title: title.trim() || source.title,
              slMarkings: slMarkings.trim() || undefined,
              date: dateStr,
              isExclusive,
              htmlContent,
              outline,
              articles,
              version: (source.version || 1) + 1,
              updatedAt: Date.now(),
            };
            setDiffPending({ diffResult, affectedCardIds, updatedSource: updated });
            return; // Wait for user confirmation
          }
        }
      }
    }

    await commitSave(htmlContent, outline, articles);
  }, [source, title, slMarkings, dateStr, isExclusive, newText, bulkFlagNeedsReview]);

  const commitSave = useCallback(async (htmlContent: string, outline: Source["outline"], articles: Source["articles"]) => {
    const updated: Source = {
      ...source,
      title: title.trim() || source.title,
      slMarkings: slMarkings.trim() || undefined,
      date: dateStr,
      isExclusive,
      htmlContent,
      outline,
      articles,
      version: (source.version || 1) + (newText.trim() ? 1 : 0),
      updatedAt: Date.now(),
    };
    await saveSource(updated);
    onSourceUpdated(updated);
    setDirty(false);
    setNewText("");
    toast({ title: "Izvor sačuvan", description: updated.title });
    onClose();
  }, [source, title, slMarkings, dateStr, isExclusive, newText, onSourceUpdated, onClose]);

  const handleDiffConfirm = useCallback(async () => {
    if (!diffPending) return;
    const { affectedCardIds, updatedSource } = diffPending;

    // Flag affected cards
    if (affectedCardIds.length > 0 && bulkFlagNeedsReview) {
      bulkFlagNeedsReview(affectedCardIds);
    }

    await saveSource(updatedSource);
    onSourceUpdated(updatedSource);
    setDirty(false);
    setNewText("");
    setDiffPending(null);
    toast({
      title: "Izvor ažuriran",
      description: affectedCardIds.length > 0
        ? `${affectedCardIds.length} kartica označeno za provjeru.`
        : updatedSource.title,
    });
    onClose();
  }, [diffPending, bulkFlagNeedsReview, onSourceUpdated, onClose]);

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Uredi metapodatke izvora</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
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
            <div className="flex items-center gap-3">
              <Switch id="exclusive" checked={isExclusive} onCheckedChange={setIsExclusive} />
              <Label htmlFor="exclusive" className="text-xs leading-tight cursor-pointer">
                Ovo je isključivi/glavni izvor za ovu kategoriju
              </Label>
            </div>

            {source.officialGazetteInfo && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                <span className="font-medium">Auto-detektovano:</span> {source.officialGazetteInfo}
              </div>
            )}

            {/* Update source text with DOCX drop zone */}
            <Collapsible open={textOpen} onOpenChange={setTextOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", textOpen && "rotate-90")} />
                Ažuriraj tekst izvora
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {/* DOCX Drag & Drop Zone */}
                <div
                  ref={dropZoneRef}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors",
                    "hover:border-primary/50 hover:bg-primary/5",
                    docxParsing ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocxFile(f); }}
                  />
                  {docxParsing ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Parsiranje {docxFileName}...
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <FileUp className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {docxFileName ? `Učitan: ${docxFileName}` : "Prevuci .docx fajl ili klikni za upload"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-muted-foreground text-center">ili zalijepite HTML direktno:</div>

                <Textarea
                  value={newText}
                  onChange={e => { setNewText(e.target.value); setDirty(true); }}
                  placeholder="Zalijepite novu verziju teksta (HTML) ovdje. Postojeće kartice neće izgubiti linkove."
                  className="min-h-[120px] text-xs"
                />
              </CollapsibleContent>
            </Collapsible>

            <Button onClick={handleSave} disabled={!dirty && !newText.trim()} className="w-full gap-2">
              <Save className="h-4 w-4" />
              Sačuvaj
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diff Preview Dialog */}
      {diffPending && (
        <SourceDiffPreview
          diffResult={diffPending.diffResult}
          affectedCardCount={diffPending.affectedCardIds.length}
          onConfirm={handleDiffConfirm}
          onCancel={() => setDiffPending(null)}
        />
      )}
    </>
  );
}
