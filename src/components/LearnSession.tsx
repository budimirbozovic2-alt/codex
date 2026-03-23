import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, getCardScore, getDueCards } from "@/lib/spaced-repetition";
import { LearnMode, LearnCardProgress, loadLearnProgress, saveLearnProgress, loadReviewLog } from "@/lib/storage";
import { addActivityEntry } from "@/lib/metacognitive-storage";
import { recordDayDiscipline, getSmartSuggestion, calcVelocity, loadPlanner } from "@/lib/planner-storage";
import { motion, AnimatePresence } from "framer-motion";
import SessionFilters from "@/components/SessionFilters";
import { Button } from "@/components/ui/button";
import LearnOnboarding, { hasSeenOnboarding } from "@/components/LearnOnboarding";
import SessionComplete from "./learn/SessionComplete";
import { LearnSessionProps, ViewWidth } from "./learn/types";
import { lazy, Suspense } from "react";
const StudyModeFree = lazy(() => import("./learn/StudyModeFree"));
const StudyModeRecall = lazy(() => import("./learn/StudyModeRecall"));
const StudyModeChain = lazy(() => import("./learn/StudyModeChain"));
import { ShieldAlert, Link2, BookOpen, Brain, ArrowLeft, ChevronRight, ListOrdered, TrendingDown, Eye, HelpCircle, AlertTriangle } from "lucide-react";

export default function LearnSession({ cards, categories, subcategories, onMarkRead, onReviewSection, onBack, onEdit, onAddKeyPart, dueCount = 0 }: LearnSessionProps) {
  const [setupStep, setSetupStep] = useState<"mode" | "filter" | "ready">("mode");
  const [learnMode, setLearnMode] = useState<LearnMode>("free");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"order" | "weakest" | "leastRead">("order");
  const [filterExamFrequent, setFilterExamFrequent] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">("all");
  const [started, setStarted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

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

  useEffect(() => { saveLearnProgress(progress); }, [progress]);

  const availableCategories = useMemo(() => {
    const cats = new Set(cards.map(c => c.category));
    return categories.filter(c => cats.has(c));
  }, [cards, categories]);

  const availableSubs = selectedCategory ? (subcategories[selectedCategory] || []) : [];
  const examFrequentCount = useMemo(() => cards.filter(c => c.tags?.includes("često-na-ispitu")).length, [cards]);

  const sortedCards = useMemo(() => {
    let filtered = selectedCategory ? cards.filter(c => c.category === selectedCategory) : [...cards];
    if (selectedSubcategory) filtered = filtered.filter(c => c.subcategory === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter(c => c.chapter === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter(c => c.tags?.includes("često-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter(c => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter(c => c.type === "flash");
    if (learnMode === "chain") filtered = filtered.filter(c => c.type === "essay" && c.sections.length >= 3);
    switch (sortMode) {
      case "weakest": return filtered.sort((a, b) => getCardScore(a) - getCardScore(b));
      case "leastRead": return filtered.sort((a, b) => (a.readCount || 0) - (b.readCount || 0));
      default: return filtered.sort((a, b) => {
        if (a.chapter && b.chapter && a.chapter === b.chapter) return (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0);
        return a.createdAt - b.createdAt;
      });
    }
  }, [cards, selectedCategory, selectedSubcategory, selectedChapter, sortMode, learnMode, filterExamFrequent, filterType]);

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
      const chainCount = cards.filter(c => c.type === "essay" && c.sections.length >= 3).length;
      const modes: { key: LearnMode; label: string; level: string; levelColor: string; desc: string; tip: string; icon: typeof BookOpen }[] = [
        { key: "free", label: "Slobodno učenje", level: "Lak", levelColor: "bg-success/15 text-success", desc: "Prolazi kroz materijal svojim tempom. Čitaj i označavaj pročitano.", tip: "Idealno za prvi susret sa gradivom — bez pritiska ocjenjivanja.", icon: BookOpen },
        { key: "active-recall", label: "Aktivno prisjećanje", level: "Srednji", levelColor: "bg-warning/15 text-warning", desc: "Pregledaj pa reprodukuj. Ocijeni svoje znanje za svaki modul.", tip: "Naučno najefektivniji metod učenja.", icon: Brain },
        { key: "chain", label: "Metod lanca", level: "Teški", levelColor: "bg-destructive/15 text-destructive", desc: "Snowball tehnika: ponovi cijeli lanac modula bez greške.", tip: "Kumulativno ponavljanje: svaki novi modul zahtijeva reprodukciju svih prethodnih.", icon: Link2 },
      ];

      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
          <AnimatePresence>
            {showOnboarding && <LearnOnboarding onComplete={() => setShowOnboarding(false)} />}
          </AnimatePresence>

          {dueCount > 50 && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Previše dospjelih kartica ({dueCount})</p>
                <p className="text-xs text-muted-foreground mt-0.5">Preporučujemo da prvo ponovite bar polovinu dospjelih kartica prije učenja novog materijala.</p>
              </div>
            </motion.div>
          )}

          {(() => {
            const totalSections = cards.reduce((s, c) => s + c.sections.length, 0);
            const learnedSections = cards.reduce((s, c) => s + c.sections.filter(sec => sec.lastReviewed).length, 0);
            if (totalSections === 0) return null;
            const progress = Math.round((learnedSections / totalSections) * 100);
            const targetReviewPct = Math.max(5, progress);
            const reviewLog = loadReviewLog();
            const todayStr = new Date().toISOString().slice(0, 10);
            const todayStart = new Date(todayStr).getTime();
            const todayEntries = reviewLog.filter(e => e.timestamp >= todayStart);
            if (todayEntries.length < 3) return null;
            const sectionFirstSeen = new Map<string, number>();
            reviewLog.forEach(e => {
              const key = `${e.cardId}:${e.sectionId}`;
              const prev = sectionFirstSeen.get(key);
              if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
            });
            let reviewCount = 0, newCount = 0;
            todayEntries.forEach(e => {
              const key = `${e.cardId}:${e.sectionId}`;
              const firstSeen = sectionFirstSeen.get(key) || e.timestamp;
              if (firstSeen < todayStart) reviewCount++; else newCount++;
            });
            const total = reviewCount + newCount;
            const actualReviewPct = total > 0 ? Math.round((reviewCount / total) * 100) : 0;
            const deficit = targetReviewPct - actualReviewPct;
            if (deficit <= 15) return null;
            return (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Prioritet: ponavljanje</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tvoj progres ({progress}%) zahtijeva ~{targetReviewPct}% fokusa na ponavljanje, ali danas je samo {actualReviewPct}%.
                  </p>
                </div>
              </motion.div>
            );
          })()}

          <div>
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
              <ArrowLeft className="h-4 w-4" /> Nazad
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-serif">Učenje</h2>
                <p className="text-muted-foreground mt-2">Izaberi režim učenja koji odgovara tvom nivou.</p>
              </div>
              <button onClick={() => setShowOnboarding(true)}
                className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Vodič kroz režime učenja">
                <HelpCircle className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            {modes.map(({ key, label, level, levelColor, desc, tip, icon: Icon }) => {
              const disabled = key === "chain" && chainCount === 0;
              return (
                <button key={key}
                  onClick={() => { if (!disabled) { setLearnMode(key); setSetupStep("filter"); } }}
                  disabled={disabled}
                  className={`rounded-xl border p-5 text-left transition-all flex items-start gap-4 ${
                    disabled ? "opacity-40 cursor-not-allowed" : "hover:border-primary/50 hover:shadow-sm cursor-pointer"
                  } ${learnMode === key ? "border-primary bg-primary/5" : "bg-card"}`}>
                  <div className={`p-3 rounded-xl ${levelColor}`}><Icon className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold">{label}</p>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${levelColor}`}>{level}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1.5 leading-relaxed">{tip}</p>
                    {key === "chain" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {chainCount > 0 ? `${chainCount} pitanja dostupno` : "Potrebna esejska pitanja sa ≥3 modula"}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
                </button>
              );
            })}
          </div>
        </motion.div>
      );
    }

    const sortOptions = [
      { key: "order" as const, label: "Hronološki", desc: "Hronološkim redoslijedom", icon: ListOrdered },
      { key: "weakest" as const, label: "Najslabija", desc: "Najniži rezultat prvo", icon: TrendingDown },
      { key: "leastRead" as const, label: "Najmanje čitana", desc: "Nepročitana prvo", icon: Eye },
    ];

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
        <div>
          <button onClick={() => setSetupStep("mode")} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
            <ArrowLeft className="h-4 w-4" /> Nazad na režime
          </button>
          <h2 className="text-3xl font-serif">
            {learnMode === "free" ? "Slobodno učenje" : learnMode === "active-recall" ? "Aktivno prisjećanje" : "Metod lanca"}
          </h2>
          <p className="text-muted-foreground">{sortedCards.length} pitanja dostupno.</p>
        </div>

        <SessionFilters
          layoutPrefix="learn" cards={cards} categories={availableCategories} subcategories={subcategories}
          selectedCategory={selectedCategory} selectedSubcategory={selectedSubcategory} selectedChapter={selectedChapter}
          filterExamFrequent={filterExamFrequent} examFrequentCount={examFrequentCount} filterType={filterType}
          onSelectCategory={cat => { setSelectedCategory(cat); setSelectedSubcategory(null); setSelectedChapter(null); }}
          onSelectSubcategory={sub => { setSelectedSubcategory(sub); setSelectedChapter(null); }}
          onSelectChapter={setSelectedChapter}
          onToggleExamFrequent={() => setFilterExamFrequent(!filterExamFrequent)}
          onFilterTypeChange={setFilterType}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Redoslijed</label>
          <div className="grid gap-2">
            {sortOptions.map(({ key, label, desc, icon: Icon }) => (
              <button key={key} onClick={() => setSortMode(key)}
                className={`rounded-xl border p-3 text-left transition-colors flex items-center gap-3 ${
                  sortMode === key ? "border-primary bg-primary/5" : "bg-card hover:border-primary/50"
                }`}>
                <div className={`p-1.5 rounded-lg ${sortMode === key ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div><p className="font-medium text-sm">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={() => setStarted(true)} className="w-full py-6 text-base" disabled={sortedCards.length === 0}>
          <BookOpen className="h-4 w-4 mr-2" /> Počni učenje
        </Button>
      </motion.div>
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
        const reviewLog = loadReviewLog();
        const plannerConfig = loadPlanner();
        const velocity = calcVelocity(reviewLog, 7);
        const suggestion = getSmartSuggestion(null, cards, plannerConfig.finalGoalDate, velocity, plannerConfig.bufferPercent ?? 15);
        const dailyGoal = suggestion?.suggestedToday ?? 0;
        const today = new Date().toISOString().slice(0, 10);
        const reviewsDoneToday = reviewLog.filter(e => new Date(e.timestamp).toISOString().slice(0, 10) === today).length;
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

  // ── ACTIVE MODES (delegated to sub-components) ──
  if (learnMode === "free") {
    return (
      <StudyModeFree
        card={card} sortedCards={sortedCards} currentIndex={currentIndex}
        viewWidth={viewWidth} setViewWidth={setViewWidth}
        readCards={readCards} completedCards={completedCards} chainCompletedCards={chainCompletedCards}
        onMarkRead={handleMarkRead} onEdit={onEdit} onAddKeyPart={onAddKeyPart}
        goToCard={goToCard} goNext={goNext} goPrev={goPrev} onBack={() => setStarted(false)}
      />
    );
  }

  if (learnMode === "active-recall") {
    return (
      <StudyModeRecall
        card={card} sortedCards={sortedCards} currentIndex={currentIndex}
        viewWidth={viewWidth} setViewWidth={setViewWidth}
        readCards={readCards} completedCards={completedCards} chainCompletedCards={chainCompletedCards}
        onMarkRead={handleMarkRead} onReviewSection={onReviewSection} onAddKeyPart={onAddKeyPart}
        goToCard={goToCard} goNext={goNext} goPrev={goPrev} onBack={() => setStarted(false)}
        setCompletedCards={setCompletedCards} setTotalGrades={setTotalGrades}
        setModulesCompleted={setModulesCompleted} updateProgress={updateProgress}
      />
    );
  }

  if (learnMode === "chain") {
    return (
      <StudyModeChain
        card={card} sortedCards={sortedCards} currentIndex={currentIndex}
        viewWidth={viewWidth} setViewWidth={setViewWidth}
        readCards={readCards} completedCards={completedCards} chainCompletedCards={chainCompletedCards}
        onReviewSection={onReviewSection}
        goToCard={goToCard} goNext={goNext} goPrev={goPrev} onBack={() => setStarted(false)}
        setChainCompletedCards={setChainCompletedCards} setTotalGrades={setTotalGrades}
        setModulesCompleted={setModulesCompleted} setChainResets={setChainResets} updateProgress={updateProgress}
      />
    );
  }

  return null;
}
