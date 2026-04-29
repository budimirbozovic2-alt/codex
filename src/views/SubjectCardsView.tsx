import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Layers, BookOpen, Network, Settings, Search, X, Pencil, LayoutList,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCardData, useCategoryData, useCardActions, useUIContext } from "@/contexts/AppContext";
import type { SubcategoryNode } from "@/lib/db";
import type { Card } from "@/lib/spaced-repetition";
import { loadSourcesByCategory, type Source } from "@/lib/sources-storage";
import CardViewMode from "@/components/category/CardViewMode";
import CardOrgMode from "@/components/category/CardOrgMode";
import StructureManagerDialog from "@/components/category/StructureManagerDialog";
import PassiveReader from "@/components/subject-cards/PassiveReader";

export default function SubjectCardsView() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();

  const { cards: allCards, ready } = useCardData();
  const { categoryRecords } = useCategoryData();
  const {
    addCard, addFlashCard, patchCard, toggleTag, deleteCard,
    addSubcategory, renameSubcategory, deleteSubcategory,
    addChapter, renameChapter, deleteChapter,
    reorderSubcategories, reorderChapters,
  } = useCardActions();
  const { setEditingCard } = useUIContext();

  const category = useMemo(
    () => categoryRecords.find(c => c.id === categoryId) ?? null,
    [categoryRecords, categoryId]
  );

  const cards = useMemo(
    () => categoryId ? allCards.filter(c => c.categoryId === categoryId) : [],
    [allCards, categoryId]
  );

  const subcategoryNodes: SubcategoryNode[] = useMemo(() => {
    if (!category?.subcategories) return [];
    return (category.subcategories as SubcategoryNode[]).map((s) =>
      typeof s === "string" ? { id: s, name: s, chapters: [], sortOrder: 0 } as SubcategoryNode : s
    );
  }, [category?.subcategories]);

  const [tab, setTab] = useState<"manage" | "read">("manage");
  /** Sub-mode within "manage" tab: list editor vs structural arrangement. */
  const [manageMode, setManageMode] = useState<"edit" | "structure">("edit");
  const [structureOpen, setStructureOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("__all__");
  const [sources, setSources] = useState<Source[]>([]);
  const [pendingPassiveCardId, setPendingPassiveCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    loadSourcesByCategory(categoryId).then(s => { if (!cancelled) setSources(s); });
    return () => { cancelled = true; };
  }, [categoryId]);

  const usedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) if (c.sourceId) set.add(c.sourceId);
    return set;
  }, [cards]);

  const sourceOptions = useMemo(
    () => sources.filter(s => usedSourceIds.has(s.id)),
    [sources, usedSourceIds],
  );

  const handleEdit = (card: Card) => {
    sessionStorage.setItem("sr-edit-return-view", "subject-cards:" + categoryId);
    setEditingCard(card);
    navigate("/edit");
  };

  const handlePassiveRead = (card: Card) => {
    setPendingPassiveCardId(card.id);
    setTab("read");
  };

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
        Predmet nije pronađen.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to={`/subject/${categoryId}`}
          className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Nazad na predmet"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">{category.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kartice — uređivanje, struktura i pasivno čitanje
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full space-y-4">
        {/* ── Group: Upravljanje ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Upravljanje
          </p>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
            <TabsTrigger value="manage" className="gap-1.5">
              <Pencil className="h-4 w-4" />
              <span>Uređivanje i dodavanje kartica</span>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{cards.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="structure" className="gap-1.5">
              <Network className="h-4 w-4" />
              <span>Struktura i raspored kartica</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Group: Učenje ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Učenje
          </p>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
            <TabsTrigger value="read" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              <span>Pasivno čitanje</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="manage" className="pt-2 space-y-3">
          <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card p-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Pretraži pitanja, odgovore, tagove..."
                className="h-8 pl-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                  aria-label="Obriši pretragu"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-8 w-auto min-w-[150px] text-xs">
                <SelectValue placeholder="Izvor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Svi izvori</SelectItem>
                {sourceOptions.length === 0 ? (
                  <SelectItem value="__none__" disabled>Nema vezanih izvora</SelectItem>
                ) : (
                  sourceOptions.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">{s.title}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <CardViewMode
            cards={cards}
            categoryId={categoryId!}
            allCategories={categoryRecords}
            patchCard={patchCard}
            toggleTag={toggleTag}
            addCard={addCard}
            addFlashCard={addFlashCard}
            onDelete={deleteCard}
            onEdit={handleEdit}
            onPassiveRead={handlePassiveRead}
            externalQuery={searchQuery}
            externalSourceId={sourceFilter}
          />
        </TabsContent>

        <TabsContent value="structure" className="pt-2 space-y-3">
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setStructureOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Uredi potkategorije i glave
            </Button>
          </div>
          <CardOrgMode
            cards={cards}
            categoryId={categoryId!}
            subcategoryNodes={subcategoryNodes}
            patchCard={patchCard}
          />
        </TabsContent>

        <TabsContent value="read" className="pt-2">
          <PassiveReader
            cards={cards}
            subcategoryNodes={subcategoryNodes}
            categoryId={categoryId!}
            onEditCard={handleEdit}
            initialCardId={pendingPassiveCardId}
            onInitialConsumed={() => setPendingPassiveCardId(null)}
          />
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
