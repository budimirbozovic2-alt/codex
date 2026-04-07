import { useParams, useNavigate } from "react-router-dom";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { getCardMasteryLevel, MASTERY_LEVELS } from "@/lib/mastery";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Source, type SubcategoryNode } from "@/lib/db";
import { saveSource, invalidateSourcesCache, deleteSource } from "@/lib/sources-storage";
import type { Card } from "@/lib/spaced-repetition";
import { useCardData, useCategoryData, useCardActions, useUIContext } from "@/contexts/AppContext";
import { lazy, Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BookOpen, FileText, Plus, Upload, Loader2, Eye, Pencil, GitBranch, Settings, Trash2, Map } from "lucide-react";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitize";
import { parseArticles } from "@/lib/article-parser";
import { extractOutline, injectHeadingIds } from "@/lib/sources-storage";
import SourceEditor from "@/components/category/SourceEditor";
import SourceReader from "@/components/SourceReader";
import CardViewMode from "@/components/category/CardViewMode";
import CardOrgMode from "@/components/category/CardOrgMode";
import CategoryMindMaps from "@/components/category/CategoryMindMaps";
import StructureManagerDialog from "@/components/category/StructureManagerDialog";
import SubcategoryList from "@/components/knowledge-map/SubcategoryList";
import { TabSkeleton } from "@/components/ui/page-skeleton";

const MentalSkeleton = lazy(() => import("@/components/MentalSkeleton"));

export default function CategoryView() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();

  // ── Boot-loaded context data (SSoT) ──
  const { cards: allCards, ready } = useCardData();
  const { categoryRecords, subcategories } = useCategoryData();

  const category = useMemo(
    () => categoryRecords.find(c => c.id === categoryId) ?? null,
    [categoryRecords, categoryId]
  );

  const allCategories = categoryRecords;

  const cards = useMemo(
    () => categoryId ? allCards.filter(c => c.categoryId === categoryId) : [],
    [allCards, categoryId]
  );

  // Sources & mindMaps are not in context — keep useLiveQuery (2 observers instead of 5)
  const sources = useLiveQuery(
    () => categoryId ? db.sources.where("categoryId").equals(categoryId).toArray() : [],
    [categoryId]
  ) ?? [];

  const mindMapCount = useLiveQuery(
    () => categoryId ? db.mindMaps.where("categoryId").equals(categoryId).count() : 0,
    [categoryId]
  ) ?? 0;

  const {
    addCard, addFlashCard, patchCard, toggleTag,
    addSubcategory, renameSubcategory, deleteSubcategory,
    addChapter, renameChapter, deleteChapter,
    reorderSubcategories, reorderChapters,
    deleteCard, bulkFlagNeedsReview,
  } = useCardActions();
  const { setEditingCard } = useUIContext();

  const [orgMode, setOrgMode] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [kmSubcategory, setKmSubcategory] = useState<string | null>(null);
  const [kmSearch, setKmSearch] = useState("");
  const [masteryFilter, setMasteryFilter] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("cards");

  // Sources: separate state for reader (full-screen) and editor (dialog)
  const [readerSource, setReaderSource] = useState<Source | null>(null);
  const [editorSource, setEditorSource] = useState<Source | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-open source from GlobalSearch navigation
  useEffect(() => {
    const openId = sessionStorage.getItem("sr-open-source-id");
    if (!openId || sources.length === 0) return;
    sessionStorage.removeItem("sr-open-source-id");
    const found = sources.find(s => s.id === openId);
    if (found) setReaderSource(found);
  }, [sources]);

  const handleSourceUpdated = useCallback(() => {
    invalidateSourcesCache();
  }, []);

  const handleDocxImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !categoryId) return;
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
      };

      await saveSource(newSource);
      invalidateSourcesCache();
      toast.success(`Izvor "${title}" uspješno importovan.`);
    } catch (err) {
      toast.error(`Greška pri importu: ${err instanceof Error ? err.message : "Nepoznata greška"}`);
    } finally {
      setImporting(false);
    }
  }, [categoryId]);

  // Derive SubcategoryNode[] from category record (must be before early returns)
  const subcategoryNodes: SubcategoryNode[] = useMemo(() => {
    if (!category?.subcategories) return [];
    return (category.subcategories as any[]).map((s: any) =>
      typeof s === "string" ? { name: s, chapters: [], sortOrder: 0 } : s
    );
  }, [category?.subcategories]);

  const masteryDist = useMemo(() => {
    if (cards.length === 0) return null;
    const counts = [0, 0, 0, 0, 0, 0];
    cards.forEach(c => { counts[getCardMasteryLevel(c)]++; });
    return counts;
  }, [cards]);

  // Full-screen reader mode
  if (readerSource) {
    return (
      <SourceReader
        source={readerSource}
        onBack={() => setReaderSource(null)}
        onSourceUpdated={(updated) => { setReaderSource(updated); invalidateSourcesCache(); }}
      />
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Kategorija nije pronađena.
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {category.color && (
          <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
        )}
        <h1 className="imperial-title text-foreground flex-1">{category.name}</h1>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setStructureOpen(true)}>
          <Settings className="h-3.5 w-3.5" />
          Struktura
        </Button>
      </div>

      {/* Mastery progress bar */}
      {masteryDist && (
        <div className="space-y-1.5">
          <TooltipProvider delayDuration={200}>
            <div className="h-2.5 rounded-full overflow-hidden flex bg-secondary">
              {masteryDist.map((count, i) => {
                const pct = (count / cards.length) * 100;
                return count > 0 ? (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-full cursor-pointer transition-[width,filter] duration-700 ease-out hover:brightness-125"
                        onClick={() => { setMasteryFilter(prev => prev === i ? null : i); setActiveTab("cards"); }}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: MASTERY_LEVELS[i].color,
                          animationDelay: `${i * 80}ms`,
                          '--segment-color': MASTERY_LEVELS[i].color,
                        } as React.CSSProperties}
                        ref={(el) => {
                          if (el && !el.dataset.animated) {
                            el.style.width = '0%';
                            requestAnimationFrame(() => {
                              el.style.width = `${pct}%`;
                              el.dataset.animated = '1';
                            });
                          }
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {MASTERY_LEVELS[i].label}: {count} ({Math.round(pct)}%)
                    </TooltipContent>
                  </Tooltip>
                ) : null;
              })}
            </div>
          </TooltipProvider>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 opacity-0 animate-fade-in" style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}>
            {masteryDist.map((count, i) =>
              count > 0 ? (
                <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MASTERY_LEVELS[i].color }} />
                  {MASTERY_LEVELS[i].label} {count}
                </span>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== "cards") setMasteryFilter(null); }} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="cards" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Kartice</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{cards.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sources" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Izvori</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{sources.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="mindmaps" className="gap-1.5">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">Mentalne mape</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{mindMapCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1.5">
            <Map className="h-4 w-4" />
            <span className="hidden sm:inline">Mapa znanja</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══ KARTICE TAB ═══ */}
        <TabsContent value="cards">
          <div className="flex items-center justify-end gap-2 mb-3">
            <Label htmlFor="org-toggle" className="text-xs text-muted-foreground">Pregled</Label>
            <Switch id="org-toggle" checked={orgMode} onCheckedChange={setOrgMode} />
            <Label htmlFor="org-toggle" className="text-xs text-muted-foreground">Organizacija</Label>
          </div>

          {orgMode ? (
            <CardOrgMode
              cards={cards}
              categoryId={categoryId!}
              subcategoryNodes={subcategoryNodes}
              patchCard={patchCard}
            />
          ) : (
            <CardViewMode
              cards={cards}
              categoryId={categoryId!}
              allCategories={allCategories}
              patchCard={patchCard}
              toggleTag={toggleTag}
              addCard={addCard}
              addFlashCard={addFlashCard}
              onDelete={deleteCard}
              onEdit={(card) => { sessionStorage.setItem("sr-edit-return-view", "category:" + categoryId); setEditingCard(card); navigate('/edit'); }}
              masteryFilter={masteryFilter}
              onClearMasteryFilter={() => setMasteryFilter(null)}
            />
          )}
        </TabsContent>

        {/* ═══ IZVORI TAB ═══ */}
        <TabsContent value="sources">
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={handleDocxImport}
            />
            <div className="flex justify-end">
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

            {sources.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nema izvora u ovoj kategoriji.</p>
                <p className="text-xs text-muted-foreground">Kliknite "Importuj DOCX" da biste započeli.</p>
              </div>
            ) : (
              sources.map(source => (
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
                    <Button variant="default" size="sm" className="gap-1.5 h-7" onClick={() => setReaderSource(source)}>
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
              ))
            )}
          </div>
        </TabsContent>

        {/* ═══ MENTALNE MAPE TAB ═══ */}
        <TabsContent value="mindmaps">
          <CategoryMindMaps categoryId={categoryId!} />
        </TabsContent>

        {/* ═══ MAPA ZNANJA TAB ═══ */}
        <TabsContent value="knowledge">
          {kmSubcategory ? (
            <Suspense fallback={<TabSkeleton />}>
              <MentalSkeleton
                cards={cards}
                category={categoryId!}
                subcategory={kmSubcategory}
                categoryRecords={categoryRecords}
                onBack={() => setKmSubcategory(null)}
                embedded
              />
            </Suspense>
          ) : (
            <SubcategoryList
              cards={cards}
              sources={sources}
              category={categoryId!}
              subcategories={subcategories}
              categoryRecords={categoryRecords}
              searchQuery={kmSearch}
              onSearchChange={setKmSearch}
              reorderMode={false}
              onBack={() => {}}
              onSelectSubcategory={(sub) => setKmSubcategory(sub)}
              embedded
              onReorderSubcategories={reorderSubcategories}
              slideVariants={{ enter: () => ({ opacity: 0 }), center: { opacity: 1 } }}
              direction={1}
              transition={{ duration: 0.2 }}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Source metadata editor dialog */}
      {editorSource && (
        <SourceEditor
          source={editorSource}
          categoryId={categoryId!}
          onClose={() => setEditorSource(null)}
          onSourceUpdated={handleSourceUpdated}
          bulkFlagNeedsReview={bulkFlagNeedsReview}
        />
      )}

      {/* Structure Manager Dialog */}
      <StructureManagerDialog
        open={structureOpen}
        onOpenChange={setStructureOpen}
        categoryId={categoryId!}
        categoryName={category.name}
        subcategoryNodes={subcategoryNodes}
        onAddSubcategory={addSubcategory}
        onRenameSubcategory={renameSubcategory}
        onDeleteSubcategory={deleteSubcategory}
        onReorderSubcategories={reorderSubcategories}
        onAddChapter={addChapter}
        onRenameChapter={renameChapter}
        onDeleteChapter={deleteChapter}
        onReorderChapters={reorderChapters}
      />

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
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  await deleteSource(deleteTarget.id);
                  invalidateSourcesCache();
                  toast.success(`Izvor "${deleteTarget.title}" obrisan.`);
                  setDeleteTarget(null);
                } catch (err) {
                  toast.error("Greška pri brisanju izvora.");
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Obriši
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
