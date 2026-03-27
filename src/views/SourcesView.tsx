import { useState, useEffect, useCallback, lazy, Suspense } from "react";










import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  loadSources, saveSource, deleteSource,
  extractOutline, injectHeadingIds, extractArticles, type Source,
} from "@/lib/sources-storage";
import { promoteHeadings, detectTitle } from "@/lib/heading-promotion";
import { compareVersions, getChangedArticleIds, matchAnchorToArticle, parseArticles, type DiffResult } from "@/lib/article-parser";
import { parseDocxInWorker } from "@/lib/docx-parser";
import { useCardContext } from "@/contexts/AppContext";
import { db, idbLoadCards, idbLoadCategories, idbLoadSubcategories, idbLoadReviewLog, idbLoadSettings } from "@/lib/db";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import { normalizeMatchText, stripHtmlText } from "@/lib/source-coverage";
import { FileText, Upload, Calendar, Trash2, Eye, RefreshCw, Tag, AlertTriangle, GitCompareArrows as GitCompare, Pencil } from "lucide-react";

const SourceReader = lazy(() => import("@/components/SourceReader"));
const SourceDiffView = lazy(() => import("@/components/SourceDiffView"));

function generateId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function SourcesView() {
  const { cards, bulkFlagNeedsReview } = useCardContext();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importLabel, setImportLabel] = useState("");
  const [importDate, setImportDate] = useState("");
  const [importGazette, setImportGazette] = useState("");
  const [importHtml, setImportHtml] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [readingSource, setReadingSource] = useState<Source | null>(null);
  const [versioningSourceId, setVersioningSourceId] = useState<string | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editGazette, setEditGazette] = useState("");
  const [editDate, setEditDate] = useState("");
  const [diffView, setDiffView] = useState<{
    result: DiffResult;
    sourceName: string;
    oldVersion: number;
    newVersion: number;
    affectedCardCount: number;
  } | null>(null);

  useEffect(() => {
    loadSources().then(s => { setSources(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleFileSelect = useCallback(async (f: File) => {
    setImportFile(f);
    const fallbackLabel = f.name.replace(/\.docx$/i, "");
    setImportLabel(fallbackLabel);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const rawHtml = await parseDocxInWorker(arrayBuffer);
      const sanitized = sanitizeHtml(rawHtml);
      const promoted = promoteHeadings(sanitized);
      setImportHtml(promoted);
      // Auto-detect title from document content
      const detectedTitle = detectTitle(promoted);
      if (detectedTitle && detectedTitle.length > 3) {
        setImportLabel(detectedTitle);
      }
    } catch {
      toast({ title: "Greška", description: "Nije moguće procesirati DOCX fajl.", variant: "destructive" });
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importHtml || !importLabel) return;
    const htmlWithIds = injectHeadingIds(importHtml);
    const outline = extractOutline(htmlWithIds);
    const articles = extractArticles(htmlWithIds);
    const source: Source = {
      id: generateId(),
      label: importLabel,
      date: importDate || new Date().toISOString().slice(0, 10),
      htmlContent: htmlWithIds,
      outline,
      articles,
      officialGazetteInfo: importGazette.trim() || undefined,
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
    setImportGazette("");
    setImportFile(null);
    const articleCount = articles.length;
    toast({
      title: "Izvor dodan",
      description: `"${source.label}" — ${articleCount > 1 ? `${articleCount} članova prepoznato` : "uvezeno"}`,
    });
  }, [importHtml, importLabel, importDate, importGazette]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = useCallback(async (id: string) => {
    const linked = cards.filter(c => c.sourceId === id).length;
    if (linked > 0) {
      setDeleteConfirmId(id);
      return;
    }
    await deleteSource(id);
    setSources(prev => prev.filter(s => s.id !== id));
    toast({ title: "Izvor obrisan" });
  }, [cards]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmId) return;
    await deleteSource(deleteConfirmId);
    setSources(prev => prev.filter(s => s.id !== deleteConfirmId));
    setDeleteConfirmId(null);
    toast({ title: "Izvor obrisan", description: "Linkovi na modulima su očišćeni." });
  }, [deleteConfirmId]);

  const handleEditSource = useCallback((source: Source) => {
    setEditingSource(source);
    setEditLabel(source.label);
    setEditDate(source.date || "");
    setEditGazette(source.officialGazetteInfo || "");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingSource || !editLabel.trim()) return;
    const updated: Source = {
      ...editingSource,
      label: editLabel.trim(),
      officialGazetteInfo: editGazette.trim() || undefined,
      updatedAt: Date.now(),
    };
    await saveSource(updated);
    setSources(prev => prev.map(s => s.id === updated.id ? updated : s));
    setEditingSource(null);
    toast({ title: "Izvor ažuriran" });
  }, [editingSource, editLabel, editGazette]);

  const handleNewVersion = useCallback(async () => {
    if (!versionFile || !versioningSourceId) return;
    const oldSource = sources.find(s => s.id === versioningSourceId);
    if (!oldSource) return;

    try {
      // Pre-version auto backup (Electron only, best-effort)
      const electronAPI = window.electronAPI;
      if (electronAPI?.requestBackup) {
        try {
          const [bCards, bCats, bSubs, bLog, bSr] = await Promise.all([
            idbLoadCards(), idbLoadCategories(), idbLoadSubcategories(),
            idbLoadReviewLog(), idbLoadSettings("srSettings", {}),
          ]);
          const backupJson = JSON.stringify({
            version: 2, type: "pre-version-backup",
            cards: bCards, categories: bCats, subcategories: bSubs,
            reviewLog: bLog, srSettings: bSr,
          });
          await electronAPI.requestBackup(backupJson);
        } catch (_) { /* best-effort */ }
      }

      // Parse DOCX in Web Worker
      const arrayBuffer = await versionFile.arrayBuffer();
      const rawHtml = await parseDocxInWorker(arrayBuffer);
      const html = sanitizeHtml(rawHtml);
      const promoted = promoteHeadings(html);
      const htmlWithIds = injectHeadingIds(promoted);
      const outline = extractOutline(htmlWithIds);
      const articles = extractArticles(htmlWithIds);

      // Smart Diff: compare at article level
      const diffResult = compareVersions(oldSource.htmlContent, htmlWithIds);
      const changedArticleIds = getChangedArticleIds(diffResult);

      // Parse old articles to match card anchors
      const oldArticles = parseArticles(oldSource.htmlContent);

      // Find cards linked to CHANGED articles only
      // Use originalSourceSnippet for smarter matching when available
      const linkedCards = cards.filter(c => c.sourceId === oldSource.id);
      const newText = normalizeMatchText(stripHtmlText(htmlWithIds));
      const oldText = normalizeMatchText(stripHtmlText(oldSource.htmlContent));
      const affectedCards = linkedCards.filter(c => {
        const snippets = c.sourceModules?.length
          ? c.sourceModules.map(module => module.originalSourceSnippet)
          : c.originalSourceSnippet
            ? [c.originalSourceSnippet]
            : [];

        if (snippets.length > 0) {
          const hasChangedSnippet = snippets.some(snippet => {
            const normalizedSnippet = normalizeMatchText(snippet);
            return !!normalizedSnippet && oldText.includes(normalizedSnippet) && !newText.includes(normalizedSnippet);
          });
          if (hasChangedSnippet) return true;
          const allStillPresent = snippets.every(snippet => {
            const normalizedSnippet = normalizeMatchText(snippet);
            return !!normalizedSnippet && oldText.includes(normalizedSnippet) && newText.includes(normalizedSnippet);
          });
          if (allStillPresent) return false;
        }
        // Fallback to article-level matching
        if (!c.textAnchor) {
          return changedArticleIds.size > 0;
        }
        const articleId = matchAnchorToArticle(c.textAnchor, oldArticles);
        return articleId ? changedArticleIds.has(articleId) : false;
      });

      // Atomic source update in IDB — preserve existing gazette info
      const newSource: Source = {
        ...oldSource,
        htmlContent: htmlWithIds,
        outline,
        articles,
        // Keep existing officialGazetteInfo (user-entered, manual only)
        version: oldSource.version + 1,
        updatedAt: Date.now(),
        previousVersionId: oldSource.id,
        previousHtmlContent: oldSource.htmlContent,
      };

      await db.transaction("rw", [db.sources], async () => {
        await db.sources.put(newSource);
      });

      // Flag affected cards via React state (patchCard pipeline)
      if (affectedCards.length > 0) {
        bulkFlagNeedsReview(affectedCards.map(c => c.id));
      }

      setSources(prev => prev.map(s => s.id === versioningSourceId ? newSource : s));
      setVersioningSourceId(null);
      setVersionFile(null);

      // Show diff view
      setDiffView({
        result: diffResult,
        sourceName: oldSource.label,
        oldVersion: oldSource.version,
        newVersion: newSource.version,
        affectedCardCount: affectedCards.length,
      });

      if (affectedCards.length > 0) {
        toast({
          title: "Nova verzija učitana",
          description: `${affectedCards.length}/${linkedCards.length} kartica označeno za provjeru (samo izmijenjeni članovi).`,
        });
      } else {
        toast({ title: "Nova verzija učitana", description: `Verzija ${newSource.version} — bez promjena u povezanim članovima.` });
      }
    } catch {
      toast({ title: "Greška", description: "Nije moguće procesirati novu verziju.", variant: "destructive" });
    }
  }, [versionFile, versioningSourceId, sources, cards, bulkFlagNeedsReview]);

  const linkedCardCount = useCallback((sourceId: string) => {
    return cards.filter(c => c.sourceId === sourceId).length;
  }, [cards]);

  const needsReviewCount = useCallback((sourceId: string) => {
    return cards.filter(c => c.sourceId === sourceId && c.needsReview).length;
  }, [cards]);

  const deleteConfirmSource = sources.find(s => s.id === deleteConfirmId);
  const deleteLinkedCount = deleteConfirmId ? linkedCardCount(deleteConfirmId) : 0;

  if (diffView) {
    return (
      <Suspense fallback={<TabSkeleton />}>
        <SourceDiffView
          diffResult={diffView.result}
          sourceName={diffView.sourceName}
          oldVersion={diffView.oldVersion}
          newVersion={diffView.newVersion}
          affectedCardCount={diffView.affectedCardCount}
          onClose={() => setDiffView(null)}
        />
      </Suspense>
    );
  }

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
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

      {sources.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">Nemate nijedan uvezen izvor.</p>
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload className="h-4 w-4 mr-1" /> Uvezi prvi izvor
          </Button>
        </div>
      )}

      {/* Source cards */}
      <div className="grid gap-3">
        {sources.sort((a, b) => b.updatedAt - a.updatedAt).map(source => {
          const linked = linkedCardCount(source.id);
          const review = needsReviewCount(source.id);
          const articleCount = source.articles?.length || 0;
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
                      {source.officialGazetteInfo && (
                        <p className="text-[11px] italic text-muted-foreground/70 mt-0.5 max-w-[260px] truncate" title={source.officialGazetteInfo}>
                          {source.officialGazetteInfo}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {source.date}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          v{source.version}
                        </Badge>
                        {articleCount > 1 && (
                          <span className="text-[10px]">{articleCount} čl.</span>
                        )}
                        {linked > 0 && (
                          <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {linked} modula
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Uredi izvor" onClick={() => handleEditSource(source)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReadingSource(source)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {source.previousHtmlContent && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Pogledaj razlike"
                        onClick={() => {
                          const diff = compareVersions(source.previousHtmlContent!, source.htmlContent);
                          setDiffView({
                            result: diff,
                            sourceName: source.label,
                            oldVersion: source.version - 1,
                            newVersion: source.version,
                            affectedCardCount: needsReviewCount(source.id),
                          });
                        }}
                      >
                        <GitCompare className="h-4 w-4" />
                      </Button>
                    )}
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
                <div className="space-y-2">
                  <label className="text-xs font-medium">Službeni list (oznaka)</label>
                  <input
                    value={importGazette}
                    onChange={e => setImportGazette(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder='npr. "Sl. list CG", br. 47/2008'
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
            Smart Diff: sistem će automatski uporediti članove po članovima i označiti za provjeru <strong className="text-foreground">samo</strong> kartice povezane sa izmijenjenim dijelovima.
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
            Uporedi i ažuriraj
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit source dialog */}
      <Dialog open={!!editingSource} onOpenChange={v => { if (!v) setEditingSource(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Uredi izvor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Naziv izvora</label>
              <input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="npr. Zakon o obligacionim odnosima"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Službeni list (oznaka)</label>
              <input
                value={editGazette}
                onChange={e => setEditGazette(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder='npr. "Sl. list CG", br. 47/2008'
              />
            </div>
            <Button onClick={handleSaveEdit} disabled={!editLabel.trim()} className="w-full">
              Sačuvaj izmjene
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={v => { if (!v) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Brisanje izvora
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Izvor <strong>"{deleteConfirmSource?.label}"</strong> je povezan sa{" "}
              <strong className="text-destructive">{deleteLinkedCount} modula</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Brisanjem izvora, linkovi na svim povezanim modulima će biti uklonjeni. Sami moduli neće biti obrisani.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)} className="flex-1">
                Otkaži
              </Button>
              <Button variant="destructive" onClick={confirmDelete} className="flex-1">
                <Trash2 className="h-4 w-4 mr-1.5" />
                Obriši ipak
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
