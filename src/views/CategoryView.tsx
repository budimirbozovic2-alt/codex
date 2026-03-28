import { useParams } from "react-router-dom";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type CategoryRecord, type Source } from "@/lib/db";
import { saveSource, invalidateSourcesCache } from "@/lib/sources-storage";
import type { Card } from "@/lib/spaced-repetition";
import { useCardData, useCardActions } from "@/contexts/AppContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BookOpen, FileText, Brain, Plus, Upload } from "lucide-react";
import SourceEditor from "@/components/category/SourceEditor";
import CardViewMode from "@/components/category/CardViewMode";
import CardOrgMode from "@/components/category/CardOrgMode";
import CategoryMnemonicWorkshop from "@/components/category/CategoryMnemonicWorkshop";

export default function CategoryView() {
  const { categoryId } = useParams<{ categoryId: string }>();

  // Live category from IDB
  const category = useLiveQuery(
    () => categoryId ? db.categories.get(categoryId) : undefined,
    [categoryId]
  );

  // All categories for move modal
  const allCategories = useLiveQuery(() => db.categories.orderBy("sortOrder").toArray(), []) ?? [];

  // Cards & sources scoped to this category
  const cards = useLiveQuery(
    () => categoryId ? db.cards.where("categoryId").equals(categoryId).toArray() : [],
    [categoryId]
  ) ?? [];

  const sources = useLiveQuery(
    () => categoryId ? db.sources.where("categoryId").equals(categoryId).toArray() : [],
    [categoryId]
  ) ?? [];

  // Card actions from context
  const { addCard, patchCard, toggleTag, addSubcategory } = useCardActions();

  // Cards tab mode toggle
  const [orgMode, setOrgMode] = useState(false);

  // Sources tab: selected source for editor
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);

  const handleSourceUpdated = useCallback((updated: Source) => {
    // Source was saved via SourceEditor; invalidate cache for other consumers
    invalidateSourcesCache();
  }, []);

  // Loading state
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

      {/* Tabs */}
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
          <TabsTrigger value="mnemonic" className="gap-2">
            <Brain className="h-4 w-4" />
            Mnemonička radionica
          </TabsTrigger>
        </TabsList>

        {/* ═══ KARTICE TAB ═══ */}
        <TabsContent value="cards">
          {/* Mode toggle */}
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
          {selectedSource ? (
            <SourceEditor
              source={selectedSource}
              categoryId={categoryId!}
              cards={cards}
              onBack={() => setSelectedSource(null)}
              onSourceUpdated={handleSourceUpdated}
              addCard={addCard}
              patchCard={patchCard}
            />
          ) : (
            <div className="space-y-3">
              {sources.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Nema izvora u ovoj kategoriji.</p>
                  <p className="text-xs text-muted-foreground">Importujte dokument da biste započeli.</p>
                </div>
              ) : (
                sources.map(source => (
                  <button
                    key={source.id}
                    onClick={() => setSelectedSource(source)}
                    className="w-full flex items-center justify-between rounded-lg border bg-card px-4 py-3 hover:bg-accent/30 transition-colors text-left"
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
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══ MNEMONIČKA RADIONICA TAB ═══ */}
        <TabsContent value="mnemonic">
          <div className="text-center py-16 space-y-2">
            <Brain className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Mnemonička radionica za: <strong className="text-foreground">{category.name}</strong>
            </p>
            <p className="text-xs text-muted-foreground">Implementacija u Phase 3b.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
