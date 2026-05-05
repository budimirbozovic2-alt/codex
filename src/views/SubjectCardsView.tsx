import { useParams, Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Layers, BookOpen, Settings, Search, X, Pencil, Sparkles, Zap, Brain,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCardData, useCategoryData, useCardOnlyActions, useCategoryActions, useUIContext, useBackupActions } from "@/contexts/AppContext";
import CardCreateMenu from "@/components/category/CardCreateMenu";
import type { SubcategoryNode } from "@/lib/db";
import type { Card } from "@/lib/spaced-repetition";

import { useEditReturn } from "@/hooks/useEditReturn";
import type { BaseEditReturnSnapshot } from "@/lib/edit-return";
import CardViewMode, { type CardViewFiltersSnapshot } from "@/components/category/CardViewMode";
import CardOrgMode from "@/components/category/CardOrgMode";
import StructureManagerDialog from "@/components/category/StructureManagerDialog";

import PassiveReader from "@/components/subject-cards/PassiveReader";
import LocalSpeedReader from "@/components/subject-cards/LocalSpeedReader";
import {
  MANAGE_MODES,
  MANAGE_MODE,
  DEFAULT_MANAGE_MODE,
  isManageMode,
  type ManageMode,
} from "@/views/subject-cards/manageModes";

type TabValue = "manage" | "read" | "speed";

interface EditReturnSnapshot extends BaseEditReturnSnapshot {
  tab?: TabValue;
  manageMode?: ManageMode;
  searchQuery?: string;
  /** CardViewMode internal filters — restored after edit-and-return. */
  cvSubcategory?: string;
  cvChapter?: string;
  cvType?: CardViewFiltersSnapshot["type"];
  cvFrequency?: CardViewFiltersSnapshot["frequency"];
  /** When tab is "read" or "speed", re-anchor reader to this card on return. */
  readerCardId?: string;
}

export default function SubjectCardsView() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();

  const { cards: allCards, ready } = useCardData();
  const { categoryRecords } = useCategoryData();
  const { addCard, addFlashCard, bulkAddFlashCards, patchCard, setFrequency, deleteCard } = useCardOnlyActions();
  const {
    addSubcategory, renameSubcategory, deleteSubcategory,
    addChapter, renameChapter, deleteChapter,
    reorderSubcategories, reorderChapters,
  } = useCategoryActions();
  const { editingCardId, setEditingCardId } = useUIContext();
  const { importCards } = useBackupActions();
  const allCategoryNames = useMemo(() => categoryRecords.map(c => c.name), [categoryRecords]);
  

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

  // M3: editingCardId comes from UIContext SSOT (synchronously mirrored on
  // setEditingCardId), so no per-component ref is needed.
  // Live mirror of CardViewMode's internal filters; updated via onFiltersChange
  // so buildExtras can capture the latest values at stash time.
  const cardViewFiltersRef = useRef<CardViewFiltersSnapshot | null>(null);
  const { initialSnapshot, stash: stashEditReturn } = useEditReturn<EditReturnSnapshot>({
    path: `/subject/${categoryId}/cards`,
    categoryId,
    buildExtras: () => ({
      tab,
      manageMode,
      searchQuery,
      cvSubcategory: cardViewFiltersRef.current?.subcategory,
      cvChapter: cardViewFiltersRef.current?.chapter,
      cvType: cardViewFiltersRef.current?.type,
      cvFrequency: cardViewFiltersRef.current?.frequency,
      readerCardId: editingCardId ?? undefined,
    }),
  });

  const restoredTab = initialSnapshot?.tab;
  const [tab, setTab] = useState<TabValue>(
    restoredTab === "read" || restoredTab === "speed" ? restoredTab : "manage"
  );
  const [manageMode, setManageMode] = useState<ManageMode>(
    isManageMode(initialSnapshot?.manageMode) ? initialSnapshot.manageMode : DEFAULT_MANAGE_MODE
  );
  const [structureOpen, setStructureOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSnapshot?.searchQuery ?? "");
  const [pendingPassiveCardId, setPendingPassiveCardId] = useState<string | null>(
    () => (initialSnapshot?.tab === "read" ? initialSnapshot.readerCardId ?? null : null)
  );
  const [pendingSpeedCardId, setPendingSpeedCardId] = useState<string | null>(
    () => (initialSnapshot?.tab === "speed" ? initialSnapshot.readerCardId ?? null : null)
  );

  const handleEdit = (card: Card) => {
    // M3: explicit id passed to stash → no reliance on SSOT timing.
    setEditingCardId(card.id);
    stashEditReturn(card.id);
    navigate("/edit");
  };

  const handleCardViewFiltersChange = useCallback((snap: CardViewFiltersSnapshot) => {
    cardViewFiltersRef.current = snap;
  }, []);

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
              Kartice — uređivanje, struktura, pasivno i brzo čitanje
            </p>
          </div>
        </div>
        {tab === "manage" && (
          <CardCreateMenu
            size="icon"
            categoryId={categoryId!}
            allCategoryNames={allCategoryNames}
            addCard={addCard}
            addFlashCard={addFlashCard}
            bulkAddFlashCards={bulkAddFlashCards}
            importEssays={importCards}
          />
        )}
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          title="Memorizacija"
          aria-label="Memorizacija"
        >
          <Link to={`/subject/${categoryId}/mnemonics`}>
            <Brain className="h-4 w-4" />
          </Link>
        </Button>
        {(tab === "read" || tab === "speed") && (
          <Button variant="outline" size="sm" onClick={() => setTab("manage")} className="gap-1.5 h-8 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Nazad na uređivanje
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="w-full space-y-4">

        {/* ── Group: Učenje (featured) ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Učenje
          </p>
          <TabsList className="w-full h-auto bg-transparent p-0 grid grid-cols-1 md:grid-cols-2 gap-3">
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

            <TabsTrigger
              value="speed"
              className="relative w-full justify-start text-left h-auto rounded-xl p-5 gap-4 border-2 border-primary/50 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 hover:border-primary hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-0.5 transition-all data-[state=active]:border-primary data-[state=active]:shadow-xl data-[state=active]:shadow-primary/20 group"
            >
              <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Zap className="h-3 w-3" />
                Brzo
              </span>
              <div className="p-3 rounded-lg shrink-0 bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:bg-primary/90 transition-colors">
                <Zap className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-base text-foreground">Brzo čitanje</p>
                <p className="text-xs text-muted-foreground mt-1 whitespace-normal">
                  RSVP brzo čitanje kartica — treniraj brzinu i fokus
                </p>
              </div>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="manage" className="pt-2 space-y-3">
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
              </div>
              <CardViewMode
                cards={cards}
                categoryId={categoryId!}
                allCategories={categoryRecords}
                subcategoryNodes={subcategoryNodes}
                patchCard={patchCard}
                setFrequency={setFrequency}
                addCard={addCard}
                addFlashCard={addFlashCard}
                bulkAddFlashCards={bulkAddFlashCards}
                onDelete={deleteCard}
                onEdit={handleEdit}
                onPassiveRead={handlePassiveRead}
                externalQuery={searchQuery}
                
                initialSubcategory={initialSnapshot?.cvSubcategory}
                initialChapter={initialSnapshot?.cvChapter}
                initialType={initialSnapshot?.cvType}
                initialFrequency={initialSnapshot?.cvFrequency}
                onFiltersChange={handleCardViewFiltersChange}
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

        <TabsContent value="speed" className="pt-2">
          <LocalSpeedReader
            cards={cards}
            subcategoryNodes={subcategoryNodes}
            categoryId={categoryId!}
            initialCardId={pendingSpeedCardId}
            onInitialConsumed={() => setPendingSpeedCardId(null)}
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
