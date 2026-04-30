import { useState, useMemo, useCallback, useEffect, useRef, Suspense, lazy } from "react";
import { Card, getCardScore } from "@/lib/spaced-repetition";
import type { FrequencyTag } from "@/lib/sr/types";
import { LearnCardProgress, loadLearnProgress } from "@/lib/storage";
import { addActivityEntry } from "@/lib/metacognitive-storage";
import SessionComplete from "./learn/SessionComplete";
import FilterSetup from "./learn/FilterSetup";
import { LearnSessionProps, ViewWidth } from "./learn/types";

const StudyModeRecall = lazy(() => import("./learn/StudyModeRecall"));

export default function LearnSession({ cards, categories, categoryRecords, subcategories, onMarkRead, onReviewSection, onBack, onEdit, onAddKeyPart, dueCount = 0, reviewLog: reviewLogProp = [], initialFilters }: LearnSessionProps) {
  const isStrictRecall = initialFilters?.mode === "strict-recall";
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialFilters?.categoryId ?? null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(initialFilters?.subcategoryId ?? null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"order" | "weakest" | "leastRead">(initialFilters?.sortMode ?? "order");
  const [filterExamFrequent, setFilterExamFrequent] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">(initialFilters?.type ?? "all");
  const [frequencyFilter, setFrequencyFilter] = useState<"all" | FrequencyTag>(initialFilters?.frequencyTag ?? "all");
  const [started, setStarted] = useState(isStrictRecall);

  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = sessionStorage.getItem("sr-learn-current-index");
    return saved ? parseInt(saved, 10) || 0 : 0;
  });
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [readCards, setReadCards] = useState<Set<string>>(new Set());
  const [completedCards, setCompletedCards] = useState<Set<string>>(new Set());
  const [chainCompletedCards] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, LearnCardProgress>>({});
  const progressLoadedRef = useRef(false);
  useEffect(() => {
    if (progressLoadedRef.current) return;
    progressLoadedRef.current = true;
    loadLearnProgress().then(setProgress);
  }, []);

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

  const availableSubs = selectedCategory ? (subcategories[selectedCategory] || []) : [];
  const examFrequentCount = useMemo(() => cards.filter(c => c.tags?.includes("često-na-ispitu")).length, [cards]);

  const sortedCards = useMemo(() => {
    let filtered = selectedCategory ? cards.filter(c => c.categoryId === selectedCategory) : [...cards];
    if (selectedSubcategory) filtered = filtered.filter(c => c.subcategoryId === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter(c => c.chapterId === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter(c => c.tags?.includes("često-na-ispitu"));
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
  }, [cards, selectedCategory, selectedSubcategory, selectedChapter, sortMode, filterExamFrequent, filterType, frequencyFilter, positionMaps]);

  const card = sortedCards[currentIndex];

  const updateProgress = useCallback((cardId: string, update: Partial<LearnCardProgress>) => {
    setProgress(prev => {
      const existing = prev[cardId] || { mode: "active-recall" as const, currentModule: 0, completedModules: [], chainPosition: 0, phase: "preview" as const, completed: false };
      return { ...prev, [cardId]: { ...existing, ...update } };
    });
  }, []);

  const goToCard = useCallback((index: number) => {
    setCurrentIndex(index);
    sessionStorage.setItem("sr-learn-current-index", String(index));
  }, []);

  const goNext = useCallback(() => { if (currentIndex + 1 < sortedCards.length) goToCard(currentIndex + 1); }, [currentIndex, sortedCards.length, goToCard]);
  const goPrev = useCallback(() => { if (currentIndex > 0) goToCard(currentIndex - 1); }, [currentIndex, goToCard]);

  // Defensive clamp: ako filter smanji listu ispod currentIndex
  useEffect(() => {
    if (started && sortedCards.length > 0 && currentIndex >= sortedCards.length) {
      goToCard(sortedCards.length - 1);
    }
  }, [started, sortedCards.length, currentIndex, goToCard]);

  const handleMarkRead = useCallback((id: string) => {
    onMarkRead(id);
    setReadCards(prev => new Set(prev).add(id));
  }, [onMarkRead]);

  // ── SETUP SCREEN (filter only, no mode selector) ──
  if (!started) {
    return (
      <FilterSetup
        cards={cards}
        sortedCardsCount={sortedCards.length}
        categories={availableCategories}
        categoryRecords={categoryRecords}
        subcategories={subcategories}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
        selectedChapter={selectedChapter}
        filterExamFrequent={filterExamFrequent}
        examFrequentCount={examFrequentCount}
        filterType={filterType}
        sortMode={sortMode}
        onSelectCategory={cat => { setSelectedCategory(cat); setSelectedSubcategory(null); setSelectedChapter(null); }}
        onSelectSubcategory={sub => { setSelectedSubcategory(sub); setSelectedChapter(null); }}
        onSelectChapter={setSelectedChapter}
        onToggleExamFrequent={() => setFilterExamFrequent(!filterExamFrequent)}
        onFilterTypeChange={setFilterType}
        onSortModeChange={setSortMode}
        onStart={() => {
          setCurrentIndex(0);
          sessionStorage.setItem("sr-learn-current-index", "0");
          setReadCards(new Set());
          setCompletedCards(new Set());
          activityLoggedRef.current = false;
          setStarted(true);
        }}
        onBack={onBack}
      />
    );
  }

  // ── EMPTY FILTER STATE (no cards match) ──
  if (!card && sortedCards.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Nema kartica za odabrani filter.</p>
        <button
          onClick={() => setStarted(false)}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
        >
          Promijeni filter
        </button>
      </div>
    );
  }

  // ── FINISHED STATE ──
  if (!card) {
    const elapsed = Date.now() - sessionStartTime;
    if (!activityLoggedRef.current && elapsed > 5000) {
      activityLoggedRef.current = true;
      addActivityEntry({ timestamp: Date.now(), type: "learn-active", durationMs: elapsed });
      (async () => { try {
        const { loadPlanner, calcVelocity, getSmartSuggestion, recordDayDiscipline } = await import("@/lib/planner-storage");
        const plannerConfig = loadPlanner();
        const velocity = calcVelocity(reviewLogProp, 7);
        const suggestion = getSmartSuggestion(null, cards, plannerConfig.finalGoalDate, velocity, plannerConfig.bufferPercent ?? 15);
        const dailyGoal = suggestion?.suggestedToday ?? 0;
        const today = new Date().toISOString().slice(0, 10);
        const reviewsDoneToday = reviewLogProp.filter(e => new Date(e.timestamp).toISOString().slice(0, 10) === today).length;
        recordDayDiscipline(today, reviewsDoneToday, dailyGoal, null);
      } catch {} })();
    }

    return (
      <SessionComplete
        sessionStartTime={sessionStartTime} totalGrades={totalGrades}
        modulesCompleted={modulesCompleted} readCardsCount={readCards.size}
        completedCardsCount={completedCards.size} onBack={onBack}
      />
    );
  }

  const fallback = <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Učitavanje...</div>;

  // ── ACTIVE RECALL MODE ──
  return (
    <Suspense fallback={fallback}>
      <StudyModeRecall
        card={card} sortedCards={sortedCards} currentIndex={currentIndex}
        viewWidth={viewWidth} setViewWidth={setViewWidth}
        readCards={readCards} completedCards={completedCards} chainCompletedCards={chainCompletedCards}
        onMarkRead={handleMarkRead} onReviewSection={onReviewSection} onAddKeyPart={onAddKeyPart}
        goToCard={goToCard} goNext={goNext} goPrev={goPrev} onBack={isStrictRecall ? onBack : () => setStarted(false)}
        setCompletedCards={setCompletedCards} setTotalGrades={setTotalGrades}
        setModulesCompleted={setModulesCompleted} updateProgress={updateProgress}
        strictRecall={isStrictRecall}
      />
    </Suspense>
  );
}