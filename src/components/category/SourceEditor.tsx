import { useState, useCallback, useEffect, useMemo } from "react";
import { Save, Calendar as CalendarIcon, FileUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Source, SourceKind } from "@/lib/db";
import { saveSource, extractOutline } from "@/lib/sources-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { injectHeadingIds } from "@/lib/sources-storage";
import { parseArticles, compareVersions, getChangedArticleIds, matchAnchorToArticle } from "@/lib/article-parser";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import SourceDiffPreview from "@/components/source-reader/SourceDiffPreview";
import { useDirtyDialog } from "@/hooks/useDirtyDialog";
import DirtyConfirmBar from "@/components/ui/dirty-confirm-bar";
import { afterDialogClose } from "@/lib/dialog-utils";
import { EditorV4 } from "@/components/editor-v4/EditorV4";
import { type EditorDoc } from "@/lib/editor-v4";
import { deriveHtml, derivePlainText } from "@/lib/editor-v4/derived";
import { useSourceDocxIngest } from "@/hooks/source-reader/useSourceDocxIngest";
import { useLinkedCards } from "@/hooks/source-reader/useLinkedCards";

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
  const [sourceKind, setSourceKind] = useState<SourceKind>(source.sourceKind ?? "propis");
  const [dirty, setDirty] = useState(false);

  // Update source text — held as canonical V4 AST; legacy HTML derived on save.
  const [newDoc, setNewDoc] = useState<EditorDoc | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  // PR-7b: HTML is NOT derived on keystroke — only when save handler runs.
  // `hasPastedText` uses cached `derivePlainText` (WeakMap by doc ref).
  const hasPastedText = useMemo(
    () => Boolean(newDoc && derivePlainText(newDoc).trim().length > 0),
    [newDoc],
  );
  const [textOpen, setTextOpen] = useState(false);

  // DOCX upload — owned by `useSourceDocxIngest` (R1 refactor).
  const {
    docxParsing,
    docxFileName,
    fileInputRef,
    dropZoneRef,
    handleDocxFile,
    handleDrop,
    handleDragOver,
  } = useSourceDocxIngest({
    onParsed: (doc) => {
      setNewDoc(doc);
      setEditorKey((k) => k + 1);
      setDirty(true);
    },
  });

  // Indexed read for linked cards — no direct `db` import.
  const { fetchLinkedCards } = useLinkedCards();

  // Diff preview
  const [diffPending, setDiffPending] = useState<{
    diffResult: import("@/lib/article-parser").DiffResult;
    affectedCardIds: string[];
    updatedSource: Source;
  } | null>(null);

  useEffect(() => {
    if (title !== source.title || slMarkings !== (source.slMarkings || "") || dateStr !== source.date || isExclusive !== (source.isExclusive || false) || sourceKind !== (source.sourceKind ?? "propis")) {
      setDirty(true);
    }
  }, [title, slMarkings, dateStr, isExclusive, sourceKind, source]);


  // ─── Save with diff check ────────────────────────────
  const handleSave = useCallback(async () => {
    // PR-7c (M3 #6): legacy `source.htmlContent` is dropped post-v22 —
    // derive the comparison baseline from the canonical AST.
    const baseHtml = deriveHtml(source.contentDoc);
    let htmlContent = baseHtml;
    let outline = source.outline;
    let articles = source.articles;

    // If user pasted new text, update HTML
    if (hasPastedText && newDoc) {
      const cleanHtml = sanitizeHtml(deriveHtml(newDoc));
      const { promoteHeadings } = await import("@/lib/heading-promotion");
      const promotedHtml = promoteHeadings(cleanHtml);
      htmlContent = injectHeadingIds(promotedHtml);
      outline = extractOutline(htmlContent);
      articles = parseArticles(htmlContent);

      // Run diff and check for affected cards
      if (baseHtml && bulkFlagNeedsReview) {
        const diffResult = compareVersions(baseHtml, htmlContent);
        const changedIds = getChangedArticleIds(diffResult);

        if (changedIds.size > 0) {
          // Find cards linked to this source with anchors in changed articles
          const linkedCards = await fetchLinkedCards(source.id);
          const oldArticles = parseArticles(baseHtml);
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
              sourceKind,
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
  }, [source, title, slMarkings, dateStr, isExclusive, sourceKind, newDoc, hasPastedText, bulkFlagNeedsReview, fetchLinkedCards]);

  const commitSave = useCallback(async (htmlContent: string, outline: Source["outline"], articles: Source["articles"]) => {
    const updated: Source = {
      ...source,
      title: title.trim() || source.title,
      slMarkings: slMarkings.trim() || undefined,
      date: dateStr,
      isExclusive,
      sourceKind,
      htmlContent,
      outline,
      articles,
      version: (source.version || 1) + (hasPastedText ? 1 : 0),
      updatedAt: Date.now(),
    };
    await saveSource(updated);
    setDirty(false);
    setNewDoc(null);
    onClose();
    afterDialogClose(() => {
      onSourceUpdated(updated);
      toast.success("Izvor sačuvan", { description: updated.title });
    });
  }, [source, title, slMarkings, dateStr, isExclusive, sourceKind, hasPastedText, onSourceUpdated, onClose]);

  const handleDiffConfirm = useCallback(async () => {
    if (!diffPending) return;
    const { affectedCardIds, updatedSource } = diffPending;

    await saveSource(updatedSource);
    setDirty(false);
    setNewDoc(null);
    setDiffPending(null);
    onClose();
    afterDialogClose(() => {
      if (affectedCardIds.length > 0 && bulkFlagNeedsReview) {
        bulkFlagNeedsReview(affectedCardIds);
      }
      onSourceUpdated(updatedSource);
      toast.success("Izvor ažuriran", {
        description: affectedCardIds.length > 0
          ? `${affectedCardIds.length} kartica označeno za provjeru.`
          : updatedSource.title,
      });
    });
  }, [diffPending, bulkFlagNeedsReview, onSourceUpdated, onClose]);

  const isDirty = dirty || hasPastedText;
  const { pendingClose, requestClose, cancelClose, confirmDiscard } = useDirtyDialog(isDirty, onClose);

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => { if (isDirty) { e.preventDefault(); requestClose(); } }}
          onEscapeKeyDown={(e) => { if (isDirty) { e.preventDefault(); requestClose(); } }}
        >
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

            <div className="space-y-1.5">
              <Label>Tip izvora</Label>
              <Select value={sourceKind} onValueChange={(v) => setSourceKind(v as SourceKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="propis">Propis</SelectItem>
                  <SelectItem value="skripta">Skripta</SelectItem>
                </SelectContent>
              </Select>
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

                <div className="text-[10px] text-muted-foreground text-center">ili napišite / zalijepite tekst direktno:</div>

                <EditorV4
                  key={`src-paste-${editorKey}`}
                  initialDoc={newDoc ?? { version: 4, content: { type: "doc", content: [] } }}
                  onChange={(doc) => { setNewDoc(doc); setDirty(true); }}
                  placeholder="Zalijepite novu verziju teksta ovdje. Postojeće kartice neće izgubiti linkove."
                  categoryId={categoryId}
                  embedKind="source"
                  className="min-h-[160px] text-xs"
                />
              </CollapsibleContent>
            </Collapsible>

            <Button onClick={handleSave} disabled={!dirty && !hasPastedText} className="w-full gap-2">
              <Save className="h-4 w-4" />
              Sačuvaj
            </Button>
          </div>

          <DirtyConfirmBar
            open={pendingClose}
            onCancel={cancelClose}
            onDiscard={() => { setDirty(false); setNewDoc(null); confirmDiscard(); }}
            onSave={async () => { await handleSave(); }}
          />
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
