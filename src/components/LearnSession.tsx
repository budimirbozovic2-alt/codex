import { useState, useMemo, useCallback, useEffect, useRef, Suspense, lazy } from "react";
import { Card, getCardScore } from "@/lib/spaced-repetition";
import { LearnMode, LearnCardProgress, loadLearnProgress, saveLearnProgress } from "@/lib/storage";
import { addActivityEntry } from "@/lib/metacognitive-storage";
import { recordDayDiscipline, getSmartSuggestion, calcVelocity, loadPlanner } from "@/lib/planner-storage";
import SessionComplete from "./learn/SessionComplete";
import ModeSelector from "./learn/ModeSelector";
import FilterSetup from "./learn/FilterSetup";
import { LearnSessionProps, ViewWidth } from "./learn/types";

const StudyModeFree = lazy(() => import("./learn/StudyModeFree"));
const StudyModeRecall = lazy(() => import("./learn/StudyModeRecall"));
const StudyModeChain = lazy(() => import("./learn/StudyModeChain"));

export default function LearnSession({ cards, categories, categoryRecords, subcategories, onMarkRead, onReviewSection, onBack, onEdit, onAddKeyPart, dueCount = 0, reviewLog: reviewLogProp = [] }: LearnSessionProps) {
  const [setupStep, setSetupStep] = useState<"mode" | "filter" | "ready">("mode");
  const [learnMode, setLearnMode] = useState<LearnMode>("free");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"order" | "weakest" | "leastRead">("order");
  const [filterExamFrequent, setFilterExamFrequent] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">("all");
  const [started, setStarted] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = sessionStorage.getItem("sr-learn-current-index");
    return saved ? parseInt(saved, 10) || 0 : 0;
  });
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [readCards, setReadCards] = useState<Set<string>>(new Set());
  const [completedCards, setCompletedCards] = useState<Set<string>>(new Set());
  const [chainCompletedCards, setChainCompletedCards] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, LearnCardProgress>>(() => loadLearnProgress());

  const [sessionStartTime] = useState(() => Date.now());
  const [totalGrades, setTotalGrades] = useState<number[]>([]);
  const [modulesCompleted, setModulesCompleted] = useState(0);
  const [chainResets, setChainResets] = useState(0);
  const activityLoggedRef = useRef(false);
  const [chapterPositionMap, setChapterPositionMap] = useState<Record<string, number>>({});

  useEffect(() => { saveLearnProgress(progress); }, [progress]);

  // B4 fix: Static import reference to avoid repeated dynamic import() on filter changes
  const dbModuleRef = useRef<typeof import("@/lib/db") | null>(null);
  useEffect(() => {
    if (!selectedCategory || !selectedSubcategory) {
      setChapterPositionMap({});
      return;
    }
    const key = `chapters-${selectedCategory}-${selectedSubcategory}`;
    const load = async () => {
      try {
        if (!dbModuleRef.current) dbModuleRef.current = await import("@/lib/db");
        const stored = await dbModuleRef.current.idbLoadSettings<string[]>(key, []);
        const map: Record<string, number> = {};
        stored.forEach((ch, i) => { map[ch] = i; });
        setChapterPositionMap(map);
      } catch (err) {
        console.error("[LearnSession] Failed to load chapter settings:", err);
        setChapterPositionMap({});
      }
    };
    load();
  }, [selectedCategory, selectedSubcategory]);

  const availableCategories = useMemo(() => {
    const cats = new Set(cards.map(c => c.categoryId));
    return categories.filter(c => cats.has(c));
  }, [cards, categories]);

  const availableSubs = selectedCategory ? (subcategories[selectedCategory] || []) : [];
  const examFrequentCount = useMemo(() => cards.filter(c => c.tags?.includes("često-na-ispitu")).length, [cards]);

  const sortedCards = useMemo(() => {
    let filtered = selectedCategory ? cards.filter(c => c.categoryId === selectedCategory) : [...cards];
    if (selectedSubcategory) filtered = filtered.filter(c => c.subcategory === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter(c => c.chapter === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter(c => c.tags?.includes("često-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter(c => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter(c => c.type === "flash");
    if (learnMode === "chain") filtered = filtered.filter(c => c.type === "essay" && c.sections.length >= 3);
    switch (sortMode) {
      case "weakest": return filtered.sort((a, b) => getCardScore(a) - getCardScore(b));
      case "leastRead": return filtered.sort((a, b) => (a.readCount || 0) - (b.readCount || 0));
      default: {
        const chPos = (c: Card) => chapterPositionMap[c.chapter ?? ""] ?? 999;
        return filtered.sort((a, b) =>
          chPos(a) - chPos(b)
          || (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0)
          || a.createdAt - b.createdAt
        );
      }
    }
  }, [cards, selectedCategory, selectedSubcategory, selectedChapter, sortMode, learnMode, filterExamFrequent, filterType, chapterPositionMap]);

  const card = sortedCards[currentIndex];

  const updateProgress = useCallback((cardId: string, update: Partial<LearnCardProgress>) => {
    setProgress(prev => {
      const existing = prev[cardId] || { mode: learnMode, currentModule: 0, completedModules: [], chainPosition: 0, phase: "preview", completed: false };
      return { ...prev, [cardId]: { ...existing, ...update } };
    });
  }, [learnMode]);

  const goToCard = useCallback((index: number) => {
    setCurrentIndex(index);
    sessionStorage.setItem("sr-learn-current-index", String(index));
  }, []);

  const goNext = useCallback(() => { if (currentIndex + 1 < sortedCards.length) goToCard(currentIndex + 1); }, [currentIndex, sortedCards.length, goToCard]);
  const goPrev = useCallback(() => { if (currentIndex > 0) goToCard(currentIndex - 1); }, [currentIndex, goToCard]);

  const handleMarkRead = useCallback((id: string) => {
    onMarkRead(id);
    setReadCards(prev => new Set(prev).add(id));
  }, [onMarkRead]);

  // ── SETUP SCREENS ──
  if (!started) {
    if (setupStep === "mode") {
      return (
        <ModeSelector
          cards={cards}
          learnMode={learnMode}
          dueCount={dueCount}
          reviewLog={reviewLogProp}
          onSelectMode={(mode) => { setLearnMode(mode); setSetupStep("filter"); }}
        />
      );
    }

    return (
      <FilterSetup
        cards={cards}
        sortedCardsCount={sortedCards.length}
        learnMode={learnMode}
        categories={availableCategories}
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
        onStart={() => setStarted(true)}
        onBackToMode={() => setSetupStep("mode")}
      />
    );
  }

  // ── FINISHED STATE ──
  if (!card) {
    const elapsed = Date.now() - sessionStartTime;
    if (!activityLoggedRef.current && elapsed > 5000) {
      activityLoggedRef.current = true;
      const activityType = learnMode === "free" ? "learn-free" as const : learnMode === "active-recall" ? "learn-active" as const : "learn-chain" as const;
      addActivityEntry({ timestamp: Date.now(), type: activityType, durationMs: elapsed });
      try {
        const plannerConfig = loadPlanner();
        const velocity = calcVelocity(reviewLogProp, 7);
        const suggestion = getSmartSuggestion(null, cards, plannerConfig.finalGoalDate, velocity, plannerConfig.bufferPercent ?? 15);
        const dailyGoal = suggestion?.suggestedToday ?? 0;
        const today = new Date().toISOString().slice(0, 10);
        const reviewsDoneToday = reviewLogProp.filter(e => new Date(e.timestamp).toISOString().slice(0, 10) === today).length;
        recordDayDiscipline(today, reviewsDoneToday, dailyGoal, null);
      } catch {}
    }

    return (
      <SessionComplete
        learnMode={learnMode} sessionStartTime={sessionStartTime} totalGrades={totalGrades}
        modulesCompleted={modulesCompleted} chainResets={chainResets} readCardsCount={readCards.size}
        completedCardsCount={completedCards.size} chainCompletedCardsCount={chainCompletedCards.size} onBack={onBack}
      />
    );
  }

  const fallback = <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Učitavanje...</div>;

  // ── ACTIVE MODES (delegated to lazy sub-components) ──
  if (learnMode === "free") {
    return (
      <Suspense fallback={fallback}>
        <StudyModeFree
          card={card} sortedCards={sortedCards} currentIndex={currentIndex}
          viewWidth={viewWidth} setViewWidth={setViewWidth}
          readCards={readCards} completedCards={completedCards} chainCompletedCards={chainCompletedCards}
          onMarkRead={handleMarkRead} onEdit={onEdit} onAddKeyPart={onAddKeyPart}
          goToCard={goToCard} goNext={goNext} goPrev={goPrev} onBack={() => setStarted(false)}
        />
      </Suspense>
    );
  }

  if (learnMode === "active-recall") {
    return (
      <Suspense fallback={fallback}>
        <StudyModeRecall
          card={card} sortedCards={sortedCards} currentIndex={currentIndex}
          viewWidth={viewWidth} setViewWidth={setViewWidth}
          readCards={readCards} completedCards={completedCards} chainCompletedCards={chainCompletedCards}
          onMarkRead={handleMarkRead} onReviewSection={onReviewSection} onAddKeyPart={onAddKeyPart}
          goToCard={goToCard} goNext={goNext} goPrev={goPrev} onBack={() => setStarted(false)}
          setCompletedCards={setCompletedCards} setTotalGrades={setTotalGrades}
          setModulesCompleted={setModulesCompleted} updateProgress={updateProgress}
        />
      </Suspense>
    );
  }

  if (learnMode === "chain") {
    return (
      <Suspense fallback={fallback}>
        <StudyModeChain
          card={card} sortedCards={sortedCards} currentIndex={currentIndex}
          viewWidth={viewWidth} setViewWidth={setViewWidth}
          readCards={readCards} completedCards={completedCards} chainCompletedCards={chainCompletedCards}
          onReviewSection={onReviewSection}
          goToCard={goToCard} goNext={goNext} goPrev={goPrev} onBack={() => setStarted(false)}
          setChainCompletedCards={setChainCompletedCards} setTotalGrades={setTotalGrades}
          setModulesCompleted={setModulesCompleted} setChainResets={setChainResets} updateProgress={updateProgress}
        />
      </Suspense>
    );
  }

  return null;
}
