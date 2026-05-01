import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { type Source } from "@/lib/db";
import { saveSource, invalidateSourcesCache, deleteSource } from "@/lib/sources-storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { parseArticles } from "@/lib/article-parser";
import { extractOutline, injectHeadingIds } from "@/lib/sources-storage";
import { loadMindMaps } from "@/lib/mindmap-storage";
import type { MindMapDoc } from "@/lib/db";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Upload, Loader2, Eye, Pencil, Trash2, Map as MapIcon, Plus, GitBranch, Workflow } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import SourceEditor from "@/components/category/SourceEditor";

interface SourcesTabProps {
  categoryId: string;
  sources: Source[];
  onOpenReader: (source: Source) => void;
  onSourceUpdated: () => void;
  bulkFlagNeedsReview: (cardIds: string[]) => void;
}

type SourceTabValue = "propis" | "skripta" | "mape";

export default function SourcesTab({ categoryId, sources, onOpenReader, onSourceUpdated, bulkFlagNeedsReview }: SourcesTabProps) {
  const navigate = useNavigate();
  const [activeSourceTab, setActiveSourceTab] = useState<SourceTabValue>("propis");
  const [editorSource, setEditorSource] = useState<Source | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mindMaps, setMindMaps] = useState<MindMapDoc[]>([]);
  const [mindMapsLoading, setMindMapsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const propisSources = useMemo(() => sources.filter(s => (s.sourceKind ?? "propis") === "propis"), [sources]);
  const skriptaSources = useMemo(() => sources.filter(s => s.sourceKind === "skripta"), [sources]);

  useEffect(() => {
    let cancelled = false;
    setMindMapsLoading(true);
    loadMindMaps().then(all => {
      if (cancelled) return;
      setMindMaps(all.filter(d => d.categoryId === categoryId));
      setMindMapsLoading(false);
    });
    return () => { cancelled = true; };
  }, [categoryId]);

  const handleDocxImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { parseDocxInWorker } = await import("@/lib/docx-parser");
      const rawHtml = await parseDocxInWorker(arrayBuffer);
      const cleanHtml = sanitizeHtml(rawHtml);
      const promotedHtml = (await import("@/lib/heading-promotion")).promoteHeadings(cleanHtml);
      const injectedHtml = injectHeadingIds(promotedHtml);
      const outline = extractOutline(injectedHtml);
      const articles = parseArticles(injectedHtml);
      const title = file.name.replace(/\.docx?$/i, "");

      const newSource: Source = {
        id: crypto.randomUUID(),
        categoryId,
        title,
        date: new Date().toISOString().slice(0, 10),
        htmlContent: promotedHtml,
        outline,
        articles,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sourceKind: activeSourceTab === "mape" ? "propis" : activeSourceTab,
      };

      await saveSource(newSource);
      invalidateSourcesCache();
      toast.success(`Izvor "${title}" uspješno importovan.`);
    } catch (err) {
      toast.error(`Greška pri importu: ${err instanceof Error ? err.message : "Nepoznata greška"}`);
    } finally {
      setImporting(false);
    }
  }, [categoryId, activeSourceTab]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSource(deleteTarget.id);
      invalidateSourcesCache();
      toast.success(`Izvor "${deleteTarget.title}" obrisan.`);
      setDeleteTarget(null);
    } catch {
      toast.error("Greška pri brisanju izvora.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  return (
    <>
      <Tabs value={activeSourceTab} onValueChange={(v) => setActiveSourceTab(v as SourceTabValue)} className="w-full">
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="propis" className="gap-1.5">
              Propisi
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                {propisSources.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="skripta" className="gap-1.5">
              Skripte
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                {skriptaSources.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="mape" className="gap-1.5">
              <MapIcon className="h-3.5 w-3.5" />
              Mentalne mape
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                {mindMaps.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
          {activeSourceTab !== "mape" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={handleDocxImport}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importing ? "Importujem…" : "Importuj DOCX"}
              </Button>
            </div>
          )}
        </div>

        {(["propis", "skripta"] as const).map(kind => {
          const filtered = kind === "propis" ? propisSources : skriptaSources;
          return (
            <TabsContent key={kind} value={kind}>
              {filtered.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Nema {kind === "propis" ? "propisa" : "skripti"} u ovoj kategoriji.
                  </p>
                  <p className="text-xs text-muted-foreground">Kliknite "Importuj DOCX" da biste započeli.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(source => (
                    <div
                      key={source.id}
                      className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-foreground truncate block">{source.title}</span>
                        {source.slMarkings && (
                          <span className="text-[10px] text-muted-foreground">{source.slMarkings}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {source.isExclusive && <Badge variant="outline" className="text-[10px]">Glavni</Badge>}
                        <span className="text-xs text-muted-foreground">{source.date}</span>
                        <Button variant="default" size="sm" className="gap-1.5 h-7" onClick={() => onOpenReader(source)}>
                          <Eye className="h-3.5 w-3.5" />
                          Čitaj
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => setEditorSource(source)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Uredi
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(source)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}

        <TabsContent value="mape">
          {mindMapsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : mindMaps.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <MapIcon className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nema mentalnih mapa za ovaj predmet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mindMaps.map(m => {
                const ModeIcon = m.mode === "procedure" ? Workflow : GitBranch;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => navigate(`/subject/${categoryId}/mind-maps?open=${m.id}`)}
                    className="w-full flex items-center justify-between rounded-lg border bg-card px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ModeIcon className={`h-4 w-4 shrink-0 ${m.mode === "procedure" ? "text-warning" : "text-primary"}`} />
                      <div className="min-w-0">
                        <span className="text-sm text-foreground truncate block">{m.title}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {m.mode === "procedure" ? "Procedura" : "Hijerarhija"} · {m.nodes.length} čvorova · {format(new Date(m.updatedAt), "dd.MM.yyyy")}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/subject/${categoryId}/mind-maps`)}
            >
              <Plus className="h-4 w-4" />
              Kreiraj mentalnu mapu
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Source metadata editor dialog */}
      {editorSource && (
        <SourceEditor
          source={editorSource}
          categoryId={categoryId}
          onClose={() => setEditorSource(null)}
          onSourceUpdated={onSourceUpdated}
          bulkFlagNeedsReview={bulkFlagNeedsReview}
        />
      )}

      {/* Delete source confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Obriši izvor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Da li ste sigurni da želite obrisati izvor <strong className="text-foreground">"{deleteTarget?.title}"</strong>?
            Kartice povezane sa ovim izvorom neće biti obrisane, ali će izgubiti vezu sa izvorom.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Otkaži</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Obriši
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
