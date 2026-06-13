import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useMemo, useRef, useState } from "react";
import { useBackupActions, useCardOnlyActions, useCategoryActions } from "@/hooks/cards/useActions";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCardReady } from "@/hooks/cards/useCardState";
import { useUIContext } from "@/hooks/useUI";
import { useCardsByCategory } from "@/store";
import type { SubcategoryNode } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import { useEditReturn } from "@/hooks/useEditReturn";
import type { CardViewFiltersSnapshot } from "@/components/category/CardViewMode";
import {
  DEFAULT_MANAGE_MODE,
  isManageMode,
  type ManageMode,
} from "@/views/subject-cards/manageModes";
import type { EditReturnSnapshot, TabValue } from "@/views/subject-cards/types";

export function useSubjectCardsState() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();

  const ready = useCardReady();
  const { categoryRecords } = useCategoryData();
  const cardActions = useCardOnlyActions();
  const categoryActions = useCategoryActions();
  const { editingCardId, setEditingCardId } = useUIContext();
  const { importCards } = useBackupActions();

  const allCategoryNames = useMemo(() => categoryRecords.map((c) => c.name), [categoryRecords]);

  const category = useMemo(
    () => categoryRecords.find((c) => c.id === categoryId) ?? null,
    [categoryRecords, categoryId],
  );

  const cards = useCardsByCategory(categoryId) as Card[];

  const subcategoryNodes: SubcategoryNode[] = useMemo(
    () => category?.subcategories ?? [],
    [category?.subcategories],
  );

  const { essayCount, flashCount } = useMemo(() => {
    let essay = 0;
    let flash = 0;
    for (const c of cards) {
      if (c.type === "essay") essay++;
      else if (c.type === "flash") flash++;
    }
    return { essayCount: essay, flashCount: flash };
  }, [cards]);

  const cardViewFiltersRef = useRef<CardViewFiltersSnapshot | null>(null);
  const tabRef = useRef<TabValue>("manage");
  const manageModeRef = useRef<ManageMode>(DEFAULT_MANAGE_MODE);
  const searchQueryRef = useRef<string>("");
  const editingCardIdRef = useRef<string | null>(editingCardId ?? null);
  editingCardIdRef.current = editingCardId ?? null;

  const buildExtras = useCallback((): Partial<EditReturnSnapshot> => ({
    tab: tabRef.current,
    manageMode: manageModeRef.current,
    searchQuery: searchQueryRef.current,
    cvSubcategory: cardViewFiltersRef.current?.subcategory,
    cvChapter: cardViewFiltersRef.current?.chapter,
    cvType: cardViewFiltersRef.current?.type,
    cvFrequency: cardViewFiltersRef.current?.frequency,
    readerCardId: editingCardIdRef.current ?? undefined,
  }), []);

  const { initialSnapshot, stash: stashEditReturn } = useEditReturn<EditReturnSnapshot>({
    path: `/subject/${categoryId}/cards`,
    categoryId,
    buildExtras,
  });

  const restoredTab = initialSnapshot?.tab;
  const [tab, setTab] = useState<TabValue>(
    restoredTab === "read" || restoredTab === "speed" ? restoredTab : "manage",
  );
  const [manageMode, setManageMode] = useState<ManageMode>(
    isManageMode(initialSnapshot?.manageMode) ? initialSnapshot.manageMode : DEFAULT_MANAGE_MODE,
  );
  const [structureOpen, setStructureOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSnapshot?.searchQuery ?? "");
  const [pendingPassiveCardId, setPendingPassiveCardId] = useState<string | null>(
    () => (initialSnapshot?.tab === "read" ? initialSnapshot.readerCardId ?? null : null),
  );
  const [pendingSpeedCardId, setPendingSpeedCardId] = useState<string | null>(
    () => (initialSnapshot?.tab === "speed" ? initialSnapshot.readerCardId ?? null : null),
  );

  tabRef.current = tab;
  manageModeRef.current = manageMode;
  searchQueryRef.current = searchQuery;

  const handleEdit = useCallback((card: Card) => {
    editingCardIdRef.current = card.id;
    setEditingCardId(card.id);
    stashEditReturn(card.id);
    navigate("/edit");
  }, [setEditingCardId, stashEditReturn, navigate]);

  const handlePassiveRead = useCallback((card: Card) => {
    setPendingPassiveCardId(card.id);
    setTab("read");
  }, []);

  const handleCardViewFiltersChange = useCallback((snap: CardViewFiltersSnapshot) => {
    cardViewFiltersRef.current = snap;
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleClearSearch = useCallback(() => setSearchQuery(""), []);
  const handleBackToManage = useCallback(() => setTab("manage"), []);
  const handleTabChange = useCallback((v: string) => setTab(v as TabValue), []);
  const handleOpenStructure = useCallback(() => setStructureOpen(true), []);
  const handleConsumedPassiveId = useCallback(() => setPendingPassiveCardId(null), []);
  const handleConsumedSpeedId = useCallback(() => setPendingSpeedCardId(null), []);

  return {
    categoryId,
    ready,
    category,
    cards,
    subcategoryNodes,
    categoryRecords,
    allCategoryNames,
    essayCount,
    flashCount,
    tab,
    manageMode,
    structureOpen,
    searchQuery,
    pendingPassiveCardId,
    pendingSpeedCardId,
    initialSnapshot,
    cardActions,
    categoryActions,
    importCards,
    setManageMode,
    setStructureOpen,
    handleEdit,
    handlePassiveRead,
    handleCardViewFiltersChange,
    handleSearchChange,
    handleClearSearch,
    handleBackToManage,
    handleTabChange,
    handleOpenStructure,
    handleConsumedPassiveId,
    handleConsumedSpeedId,
  };
}

export type SubjectCardsState = ReturnType<typeof useSubjectCardsState>;
