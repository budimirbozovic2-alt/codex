import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { default as FileText } from "lucide-react/dist/esm/icons/file-text";
import { default as Upload } from "lucide-react/dist/esm/icons/upload";
import { default as Calendar } from "lucide-react/dist/esm/icons/calendar";
import { default as Trash2 } from "lucide-react/dist/esm/icons/trash-2";
import { default as Eye } from "lucide-react/dist/esm/icons/eye";
import { default as RefreshCw } from "lucide-react/dist/esm/icons/refresh-cw";
import { default as Tag } from "lucide-react/dist/esm/icons/tag";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  loadSources, saveSource, deleteSource,
  extractOutline, injectHeadingIds, type Source,
} from "@/lib/sources-storage";
import { useAppContext } from "@/contexts/AppContext";
import { db } from "@/lib/db";
import { TabSkeleton } from "@/components/ui/page-skeleton";

const SourceReader = lazy(() => import("@/components/SourceReader"));

function generateId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function SourcesView() {
  const { cards } = useAppContext();
  const [sources, setSources] = useState<Source[]>([]);
  const [importing, setImporting] = useState(false);
  const [importLabel, setImportLabel] = useState("");
  const [importDate, setImportDate] = useState("");
  const [importHtml, setImportHtml] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [readingSource, setReadingSource] = useState<Source | null>(null);
  const [versioningSourceId, setVersioningSourceId] = useState<string | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);

  useEffect(() => {
    loadSources().then(setSources);
  }, []);

  const handleFileSelect = useCallback(async (f: File) => {
    setImportFile(f);
    setImportLabel(f.name.replace(/\.docx$/i, ""));
    try {
      const arrayBuffer = await f.arrayBuffer();
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setImportHtml(sanitizeHtml(result.value));
    } catch {
      toast({ title: "Greška", description: "Nije moguće procesirati DOCX fajl.", variant: "destructive" });
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importHtml || !importLabel) return;
    const htmlWithIds = injectHeadingIds(importHtml);
    const outline = extractOutline(htmlWithIds);
    const source: Source = {
      id: generateId(),
      label: importLabel,
      date: importDate || new Date().toISOString().slice(0, 10),
      htmlContent: htmlWithIds,
      outline,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveSource(source);
    setSources(prev => [...prev, source]);
    setImporting(false);
    setImportHtml("");
    setImportLabel("");
    setImportDate("");
    setImportFile(null);
    toast({ title: "Izvor dodan", description: `"${source.label}" uspješno uvezen.` });
  }, [importHtml, importLabel, importDate]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSource(id);
    setSources(prev => prev.filter(s => s.id !== id));
    toast({ title: "Izvor obrisan" });
  }, []);

  const handleNewVersion = useCallback(async () => {
    if (!versionFile || !versioningSourceId) return;
    const oldSource = sources.find(s => s.id === versioningSourceId);
    if (!oldSource) return;

    try {
      const arrayBuffer = await versionFile.arrayBuffer();
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = sanitizeHtml(result.value);
      const htmlWithIds = injectHeadingIds(html);
      const outline = extractOutline(htmlWithIds);

      const newSource: Source = {
        ...oldSource,
        htmlContent: htmlWithIds,
        outline,
        version: oldSource.version + 1,
        updatedAt: Date.now(),
        previousVersionId: oldSource.id,
      };
      await saveSource(newSource);

      // Mark all linked cards as needsReview
      const linkedCards = cards.filter(c => c.sourceId === oldSource.id);
      if (linkedCards.length > 0) {
        const updated = linkedCards.map(c => ({ ...c, needsReview: true }));
        await db.cards.bulkPut(updated);
        toast({
          title: "Nova verzija učitana",
          description: `${linkedCards.length} kartica označeno za provjeru.`,
        });
      } else {
        toast({ title: "Nova verzija učitana", description: `Verzija ${newSource.version}` });
      }

      setSources(prev => prev.map(s => s.id === versioningSourceId ? newSource : s));
      setVersioningSourceId(null);
      setVersionFile(null);
    } catch {
      toast({ title: "Greška", description: "Nije moguće procesirati novu verziju.", variant: "destructive" });
    }
  }, [versionFile, versioningSourceId, sources, cards]);

  const linkedCardCount = useCallback((sourceId: string) => {
    return cards.filter(c => c.sourceId === sourceId).length;
  }, [cards]);

  const needsReviewCount = useCallback((sourceId: string) => {
    return cards.filter(c => c.sourceId === sourceId && c.needsReview).length;
  }, [cards]);

  if (readingSource) {
    return (
      <Suspense fallback={<TabSkeleton />}>
        <SourceReader
          source={readingSource}
          onBack={() => {
            loadSources().then(setSources);
            setReadingSource(null);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sources.length === 0 ? "Nema uvezenih izvora." : `${sources.length} izvor${sources.length === 1 ? "" : "a"}`}
        </p>
        <Button size="sm" onClick={() => setImporting(true)} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          Uvezi izvor
        </Button>
      </div>

      {/* Source cards */}
      <div className="grid gap-3">
        {sources.sort((a, b) => b.updatedAt - a.updatedAt).map(source => {
          const linked = linkedCardCount(source.id);
          const review = needsReviewCount(source.id);
          return (
            <Card key={source.id} className="group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm truncate">{source.label}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {source.date}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          v{source.version}
                        </Badge>
                        {linked > 0 && (
                          <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {linked} kartica
                          </span>
                        )}
                        {review > 0 && (
                          <span className="flex items-center gap-1 text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            {review} za provjeru
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReadingSource(source)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setVersioningSourceId(source.id); setVersionFile(null); }}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(source.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Import dialog */}
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Uvezi izvor (.docx)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => document.getElementById("source-file-input")?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f?.name.endsWith(".docx")) handleFileSelect(f);
              }}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {importFile ? importFile.name : "Prevuci .docx fajl ili klikni za odabir"}
              </p>
              <input
                id="source-file-input"
                type="file"
                accept=".docx"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>

            {importHtml && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Oznaka izvora</label>
                  <input
                    value={importLabel}
                    onChange={e => setImportLabel(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="npr. Zakon o obligacionim odnosima"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Datum donošenja/važenja</label>
                  <input
                    type="date"
                    value={importDate}
                    onChange={e => setImportDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border p-3">
                  <div className="prose prose-sm max-w-none text-xs" dangerouslySetInnerHTML={{ __html: importHtml.slice(0, 2000) + (importHtml.length > 2000 ? "…" : "") }} />
                </div>
                <Button onClick={handleImport} disabled={!importLabel} className="w-full">
                  Uvezi izvor
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New version dialog */}
      <Dialog open={!!versioningSourceId} onOpenChange={v => { if (!v) setVersioningSourceId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova verzija izvora</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Upload novog .docx fajla će ažurirati tekst izvora i automatski označiti sve povezane kartice za provjeru.
          </p>
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => document.getElementById("version-file-input")?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f?.name.endsWith(".docx")) setVersionFile(f);
            }}
          >
            <RefreshCw className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {versionFile ? versionFile.name : "Odaberi novu verziju (.docx)"}
            </p>
            <input
              id="version-file-input"
              type="file"
              accept=".docx"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setVersionFile(f); }}
            />
          </div>
          <Button onClick={handleNewVersion} disabled={!versionFile} className="w-full">
            Ažuriraj izvor
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
