import { useParams } from "react-router-dom";
import { useState, useCallback, useMemo, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Source } from "@/lib/db";
import { saveSource, invalidateSourcesCache } from "@/lib/sources-storage";
import type { Card } from "@/lib/spaced-repetition";
import { useCardActions } from "@/contexts/AppContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BookOpen, FileText, Plus, Upload, Loader2, Eye, Pencil, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitize";
import { parseArticles } from "@/lib/article-parser";
import { extractOutline, injectHeadingIds } from "@/lib/sources-storage";
import SourceEditor from "@/components/category/SourceEditor";
import SourceReader from "@/components/SourceReader";
import CardViewMode from "@/components/category/CardViewMode";
import CardOrgMode from "@/components/category/CardOrgMode";
import CategoryMindMaps from "@/components/category/CategoryMindMaps";

export default function CategoryView() {
  const { categoryId } = useParams<{ categoryId: string }>();

  const category = useLiveQuery(
    () => categoryId ? db.categories.get(categoryId) : undefined,
    [categoryId]
  );

  const allCategories = useLiveQuery(() => db.categories.orderBy("sortOrder").toArray(), []) ?? [];

  const cards = useLiveQuery(
    () => categoryId ? db.cards.where("categoryId").equals(categoryId).toArray() : [],
    [categoryId]
  ) ?? [];

  const sources = useLiveQuery(
    () => categoryId ? db.sources.where("categoryId").equals(categoryId).toArray() : [],
    [categoryId]
  ) ?? [];

  const mindMapCount = useLiveQuery(
    () => categoryId ? db.mindMaps.where("categoryId").equals(categoryId).count() : 0,
    [categoryId]
  ) ?? 0;

  const { addCard, patchCard, toggleTag, addSubcategory, renameSubcategory, deleteSubcategory } = useCardActions();

  const [orgMode, setOrgMode] = useState(false);

  // Sources: separate state for reader (full-screen) and editor (dialog)
  const [readerSource, setReaderSource] = useState<Source | null>(null);
  const [editorSource, setEditorSource] = useState<Source | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Full-screen reader mode
  if (readerSource) {
    return <SourceReader source={readerSource} onBack={() => setReaderSource(null)} />;
  }

  if (category === undefined) {
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
        <h1 className="text-2xl font-bold text-foreground">{category.name}</h1>
      </div>

      {/* Tabs — only Kartice & Izvori */}
      <Tabs defaultValue="cards" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="cards" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Kartice
            <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{cards.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sources" className="gap-2">
            <FileText className="h-4 w-4" />
            Izvori
            <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{sources.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="mindmaps" className="gap-2">
            <GitBranch className="h-4 w-4" />
            Mentalne mape
            <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{mindMapCount}</Badge>
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
              category={category}
              patchCard={patchCard}
              addSubcategory={addSubcategory}
              renameSubcategory={renameSubcategory}
              deleteSubcategory={deleteSubcategory}
            />
          ) : (
            <CardViewMode
              cards={cards}
              categoryId={categoryId!}
              allCategories={allCategories}
              patchCard={patchCard}
              toggleTag={toggleTag}
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
      </Tabs>

      {/* Source metadata editor dialog */}
      {editorSource && (
        <SourceEditor
          source={editorSource}
          categoryId={categoryId!}
          onClose={() => setEditorSource(null)}
          onSourceUpdated={handleSourceUpdated}
        />
      )}
    </div>
  );
}
