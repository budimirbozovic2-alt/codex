import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { getCardScore } from "@/lib/spaced-repetition";
import type { FrequencyTag } from "@/lib/sr/types";
import type { LearnCardProgress } from "@/lib/types/logs";
import { loadAllLearnProgress, replaceAllLearnProgress } from "@/lib/db/queries";
import { addActivityEntry } from "@/domains/metacognition/metacognitive-storage";
import { setImmersiveMode } from "@/store/useUIStore";
import { LearnSessionProps, ViewWidth } from "@/components/learn/types";
import { useSessionDiscipline } from "@/hooks/planner/useSessionDiscipline";

export function useLearnSession({
  cards,
  categories,
  categoryRecords,
  subcategories,
  onMarkRead,
  onReviewSection,
  onBack,
  onAddKeyPart,
  reviewLog: reviewLogProp = [],
  initialFilters,
  restoreSnapshot,
  onSessionStateChange,
}: LearnSessionProps) {
  const isStrictRecall = initialFilters?.mode === "strict-recall";
  const { trackSection, resetSession, recordAfterSession } = useSessionDiscipline();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(restoreSnapshot?.selectedCategory ?? initialFilters?.categoryId ?? null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(restoreSnapshot?.selectedSubcategory ?? initialFilters?.subcategoryId ?? null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(restoreSnapshot?.selectedChapter ?? null);
  const [sortMode, setSortMode] = useState<"order" | "weakest" | "leastRead">(restoreSnapshot?.sortMode ?? initialFilters?.sortMode ?? "order");
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">(restoreSnapshot?.filterType ?? initialFilters?.type ?? "all");
  const [frequencyFilter, setFrequencyFilter] = useState<"all" | FrequencyTag>(restoreSnapshot?.frequencyFilter ?? initialFilters?.frequencyTag ?? "all");
  const [started, setStarted] = useState(isStrictRecall || (restoreSnapshot?.started ?? false));

  const [currentIndex, setCurrentIndex] = useState(() =>
    typeof restoreSnapshot?.currentIndex === "number" ? restoreSnapshot.currentIndex : 0,
  );
  const [viewWidth, setViewWidth] = useState<ViewWidth>(restoreSnapshot?.viewWidth ?? "normal");
  const [readCards, setReadCards] = useState<Set<string>>(new Set());
  const [completedCards, setCompletedCards] = useState<Set<string>>(new Set());
  const [chainCompletedCards] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, LearnCardProgress>>({});
  const [sessionFinished, setSessionFinished] = useState(false);
  const progressLoadedRef = useRef(false);

  useEffect(() => {
    setImmersiveMode(started);
    return () => { setImmersiveMode(false); };
  }, [started]);

  const progressReadyRef = useRef(false);
  useEffect(() => {
    if (progressLoadedRef.current) return;
    progressLoadedRef.current = true;
    loadAllLearnProgress().then((data) => {
      setProgress(data);
      progressReadyRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!progressReadyRef.current) return;
    const timer = setTimeout(() => { void replaceAllLearnProgress(progress); }, 400);
    return () => clearTimeout(timer);
  }, [progress]);

  const [sessionStartTime] = useState(() => Date.now());
  const [totalGrades, setTotalGrades] = useState<number[]>([]);
  const [modulesCompleted, setModulesCompleted] = useState(0);
  const activityLoggedRef = useRef(false);
  const positionMaps = useMemo(() => {
    const subPos: Record<string, number> = {};
    const chapPos: Record<string, number> = {};
    const catRec = categoryRecords.find(r => r.id === selectedCategory);
    if (!catRec) return { subPos, chapPos };
    for (const node of catRec.subcategories ?? []) {
      subPos[node.id ?? node.name] = node.sortOrder ?? 0;
      (node.chapters ?? []).forEach((ch: { id: string; name: string } | string, i: number) => {
        const key = typeof ch === "string" ? ch : ch.id;
        chapPos[key] = i;
      });
    }
    return { subPos, chapPos };
  }, [categoryRecords, selectedCategory]);

  const availableCategories = useMemo(() => {
    const cats = new Set(cards.map(c => c.categoryId));
    return categories.filter(c => cats.has(c));
  }, [cards, categories]);

  const frequencyCounts = useMemo(() => {
    const counts: Record<FrequencyTag, number> = { "često": 0, "rijetko": 0, "nikad": 0 };
    for (const c of cards) {
      if (c.frequencyTag) counts[c.frequencyTag] = (counts[c.frequencyTag] ?? 0) + 1;
    }
    return counts;
  }, [cards]);

  const sortedCards = useMemo(() => {
    let filtered = selectedCategory ? cards.filter(c => c.categoryId === selectedCategory) : [...cards];
    if (selectedSubcategory) filtered = filtered.filter(c => c.subcategoryId === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter(c => c.chapterId === selectedChapter);
    if (filterType === "essay") filtered = filtered.filter(c => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter(c => c.type === "flash");
    if (frequencyFilter !== "all") filtered = filtered.filter(c => c.frequencyTag === frequencyFilter);
    switch (sortMode) {
      case "weakest": return filtered.sort((a, b) => getCardScore(a) - getCardScore(b));
      case "leastRead": return filtered.sort((a, b) => (a.readCount || 0) - (b.readCount || 0));
      default: {
        const { subPos, chapPos } = positionMaps;
        return filtered.sort((a, b) =>
          (subPos[a.subcategoryId ?? ""] ?? 999) - (subPos[b.subcategoryId ?? ""] ?? 999)
          || (chapPos[a.chapterId ?? ""] ?? 999) - (chapPos[b.chapterId ?? ""] ?? 999)
          || (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0)
          || a.createdAt - b.createdAt
        );
      }
    }
  }, [cards, selectedCategory, selectedSubcategory, selectedChapter, sortMode, filterType, frequencyFilter, positionMaps]);

  const effectiveIndex = useMemo(() => {
    if (sortedCards.length === 0) return 0;
    return Math.min(Math.max(0, currentIndex), sortedCards.length - 1);
  }, [sortedCards.length, currentIndex]);

  const card = sortedCards[effectiveIndex];

  const goToCard = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current || !started || !isStrictRecall) return;
    autoStartedRef.current = true;
    goToCard(0);
    setSessionFinished(false);
  }, [started, isStrictRecall, goToCard]);

  useEffect(() => {
    if (!started || sessionFinished || sortedCards.length === 0) return;
    if (effectiveIndex !== currentIndex) {
      goToCard(effectiveIndex);
    }
  }, [started, sessionFinished, sortedCards.length, effectiveIndex, currentIndex, goToCard]);

  const reanchorRef = useRef(false);
  useEffect(() => {
    if (reanchorRef.current) return;
    const targetId = restoreSnapshot?.cardId;
    if (!targetId || sortedCards.length === 0) return;
    reanchorRef.current = true;
    const idx = sortedCards.findIndex(c => c.id === targetId);
    if (idx >= 0 && idx !== currentIndex) {
      setCurrentIndex(idx);
    }
  }, [restoreSnapshot?.cardId, sortedCards, currentIndex]);

  useEffect(() => {
    onSessionStateChange?.({
      started, selectedCategory, selectedSubcategory, selectedChapter,
      sortMode, filterType, frequencyFilter,
      currentIndex, viewWidth,
      cardId: card?.id,
    });
  }, [onSessionStateChange, started, selectedCategory, selectedSubcategory, selectedChapter, sortMode, filterType, frequencyFilter, currentIndex, viewWidth, card?.id]);

  const updateProgress = useCallback((cardId: string, update: Partial<LearnCardProgress>) => {
    setProgress(prev => {
      const existing = prev[cardId] || { mode: "active-recall" as const, currentModule: 0, completedModules: [], chainPosition: 0, phase: "preview" as const, completed: false };
      return { ...prev, [cardId]: { ...existing, ...update } };
    });
  }, []);

  const goNext = useCallback(() => {
    if (currentIndex + 1 < sortedCards.length) {
      goToCard(currentIndex + 1);
    } else {
      setSessionFinished(true);
    }
  }, [currentIndex, sortedCards.length, goToCard]);

  const goPrev = useCallback(() => { if (currentIndex > 0) goToCard(currentIndex - 1); }, [currentIndex, goToCard]);

  const handleMarkRead = useCallback((id: string) => {
    onMarkRead(id);
    setReadCards(prev => new Set(prev).add(id));
  }, [onMarkRead]);

  const handleReviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
    trackSection(cardId, sectionId);
    onReviewSection(cardId, sectionId, grade);
  }, [onReviewSection, trackSection]);

  const handleStart = useCallback(() => {
    setCurrentIndex(0);
    setReadCards(new Set());
    setCompletedCards(new Set());
    setSessionFinished(false);
    activityLoggedRef.current = false;
    resetSession();
    setStarted(true);
  }, [resetSession]);

  const handleSelectCategory = useCallback((cat: string | null) => {
    setSelectedCategory(cat);
    setSelectedSubcategory(null);
    setSelectedChapter(null);
  }, []);

  const handleSelectSubcategory = useCallback((sub: string | null) => {
    setSelectedSubcategory(sub);
    setSelectedChapter(null);
  }, []);

  const handleEmptyFilterAction = useCallback(() => {
    setStarted(false);
  }, []);

  const handleActiveBack = useCallback(() => {
    if (isStrictRecall) {
      onBack();
    } else {
      setStarted(false);
    }
  }, [isStrictRecall, onBack]);

  useEffect(() => {
    if (!sessionFinished) return;
    const elapsed = Date.now() - sessionStartTime;
    if (!activityLoggedRef.current && elapsed > 5000) {
      activityLoggedRef.current = true;
      addActivityEntry({ timestamp: Date.now(), type: "learn-active", durationMs: elapsed });
    }
    recordAfterSession({ reviewLog: reviewLogProp, cards, elapsedMs: elapsed });
  }, [sessionFinished, sessionStartTime, reviewLogProp, cards, recordAfterSession]);

  return {
    started,
    sessionFinished,
    isStrictRecall,
    cards,
    sortedCards,
    card,
    effectiveIndex,
    availableCategories,
    categoryRecords,
    subcategories,
    frequencyCounts,
    selectedCategory,
    selectedSubcategory,
    selectedChapter,
    frequencyFilter,
    filterType,
    sortMode,
    viewWidth,
    setViewWidth,
    readCards,
    completedCards,
    chainCompletedCards,
    sessionStartTime,
    totalGrades,
    modulesCompleted,
    setCompletedCards,
    setTotalGrades,
    setModulesCompleted,
    updateProgress,
    cardProgress: card ? progress[card.id] : undefined,
    onAddKeyPart,
    onBack,
    handleSelectCategory,
    handleSelectSubcategory,
    setSelectedChapter,
    setFrequencyFilter,
    setFilterType,
    setSortMode,
    handleStart,
    handleEmptyFilterAction,
    handleMarkRead,
    handleReviewSection,
    goToCard,
    goNext,
    goPrev,
    handleActiveBack,
  };
}
