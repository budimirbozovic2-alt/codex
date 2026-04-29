import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Layers, BookOpen, Settings, Search, X, Pencil, Sparkles,
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
import { useEditReturn } from "@/hooks/useEditReturn";
import CardViewMode from "@/components/category/CardViewMode";
import CardOrgMode from "@/components/category/CardOrgMode";
import StructureManagerDialog from "@/components/category/StructureManagerDialog";
import PassiveReader from "@/components/subject-cards/PassiveReader";
import {
  MANAGE_MODES,
  MANAGE_MODE,
  DEFAULT_MANAGE_MODE,
  isManageMode,
  type ManageMode,
} from "@/views/subject-cards/manageModes";

interface EditReturnSnapshot {
  tab?: "manage" | "read";
  manageMode?: ManageMode;
  searchQuery?: string;
  sourceFilter?: string;
  scrollY?: number;
}

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

  const { essayCount, flashCount } = useMemo(() => {
    let essay = 0, flash = 0;
    for (const c of cards) {
      if (c.type === "essay") essay++;
      else if (c.type === "flash") flash++;
    }
    return { essayCount: essay, flashCount: flash };
  }, [cards]);

  /**
   * Encapsulates: consume snapshot once on mount, restore window scroll
   * across RAF ticks (virtualized list grows async), and expose `stash()`
   * to call before navigating to /edit.
   */
  const { initialSnapshot, stash: stashEditReturn } = useEditReturn<EditReturnSnapshot>({
    path: `/subject/${categoryId}/cards`,
    buildSnapshot: () => ({
      tab,
      manageMode,
      searchQuery,
      sourceFilter,
      scrollY: window.scrollY,
    }),
  });

  const [tab, setTab] = useState<"manage" | "read">(initialSnapshot?.tab ?? "manage");
  /** Sub-mode within "manage" tab: list editor vs structural arrangement. */
  const [manageMode, setManageMode] = useState<ManageMode>(
    isManageMode(initialSnapshot?.manageMode) ? initialSnapshot.manageMode : DEFAULT_MANAGE_MODE
  );
  const [structureOpen, setStructureOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSnapshot?.searchQuery ?? "");
  const [sourceFilter, setSourceFilter] = useState<string>(initialSnapshot?.sourceFilter ?? "__all__");
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
    // Stash absolute return path + UI snapshot so EditPage and this view can
    // collaboratively restore the user's exact spot after save/cancel.
    stashEditReturn();
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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground truncate">{category.name}</h1>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1" title="Esejska pitanja">
                <Pencil className="h-3 w-3" /> Esej: {essayCount}
              </Badge>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1" title="Blic pitanja">
                <Sparkles className="h-3 w-3" /> Blic: {flashCount}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kartice — uređivanje, struktura i pasivno čitanje
            </p>
          </div>
        </div>
        {tab === "read" && (
          <Button variant="outline" size="sm" onClick={() => setTab("manage")} className="gap-1.5 h-8 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Nazad na uređivanje
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "manage" | "read")} className="w-full space-y-4">

        {/* ── Group: Učenje (featured) ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Učenje
          </p>
          <TabsList className="w-full h-auto bg-transparent p-0">
            <TabsTrigger
              value="read"
              className="relative w-full justify-start text-left h-auto rounded-xl p-5 gap-4 border-2 border-primary/50 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 hover:border-primary hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-0.5 transition-all data-[state=active]:border-primary data-[state=active]:shadow-xl data-[state=active]:shadow-primary/20 group"
            >
              <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" />
                Preporučeno
              </span>
              <div className="p-3 rounded-lg shrink-0 bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:bg-primary/90 transition-colors">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-base text-foreground">Pasivno čitanje</p>
                <p className="text-xs text-muted-foreground mt-1 whitespace-normal">
                  Slušanje i čitanje sadržaja kartica bez ocjenjivanja
                </p>
              </div>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="manage" className="pt-2 space-y-3">
          {/* Segmented sub-mode switch — driven by MANAGE_MODES registry. */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border bg-card p-0.5">
              {MANAGE_MODES.map((mode) => {
                const Icon = mode.icon;
                const active = manageMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setManageMode(mode.id)}
                    title={mode.tooltip}
                    aria-label={mode.tooltip}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {mode.label}
                    <span className="opacity-60">({mode.shortTag})</span>
                  </button>
                );
              })}
            </div>

            {manageMode === MANAGE_MODE.Structure && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setStructureOpen(true)}
              >
                <Settings className="h-3.5 w-3.5" />
                Uredi potkategorije i glave
              </Button>
            )}
          </div>

          {manageMode === MANAGE_MODE.Edit ? (
            <>
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
                subcategoryNodes={subcategoryNodes}
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
            </>
          ) : (
            <CardOrgMode
              cards={cards}
              categoryId={categoryId!}
              subcategoryNodes={subcategoryNodes}
              patchCard={patchCard}
            />
          )}
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
