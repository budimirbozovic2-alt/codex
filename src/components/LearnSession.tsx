import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, getCardScore, getDueCards } from "@/lib/spaced-repetition";
import { LearnMode, LearnCardProgress, loadLearnProgress, saveLearnProgress, loadReviewLog } from "@/lib/storage";
import { addActivityEntry } from "@/lib/metacognitive-storage";
import { recordDayDiscipline, getSmartSuggestion, calcVelocity, loadPlanner } from "@/lib/planner-storage";
import { default as ShieldAlert } from "lucide-react/dist/esm/icons/shield-alert";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, BarChart3, Volume2 } from "lucide-react";
import { default as Pencil } from "lucide-react/dist/esm/icons/pencil";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as ArrowRight } from "lucide-react/dist/esm/icons/arrow-right";
import { default as ChevronRight } from "lucide-react/dist/esm/icons/chevron-right";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as Check } from "lucide-react/dist/esm/icons/check";
import { default as Eye } from "lucide-react/dist/esm/icons/eye";
import { default as TrendingDown } from "lucide-react/dist/esm/icons/trending-down";
import { default as ListOrdered } from "lucide-react/dist/esm/icons/list-ordered";
import { default as Zap } from "lucide-react/dist/esm/icons/zap";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw";
import { default as HelpCircle } from "lucide-react/dist/esm/icons/help-circle";
import { default as Clock } from "lucide-react/dist/esm/icons/clock";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { default as RotateCw } from "lucide-react/dist/esm/icons/rotate-cw";
import { default as Trophy } from "lucide-react/dist/esm/icons/trophy";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import ScrollableRow from "@/components/ScrollableRow";
import { Button } from "@/components/ui/button";
import { speak } from "@/lib/tts";
import LearnOnboarding, { hasSeenOnboarding } from "@/components/LearnOnboarding";
import TextSelectionTooltip from "@/components/TextSelectionTooltip";

// Sub-components
import SessionHeader from "./learn/SessionHeader";
import QuestionDots from "./learn/QuestionDots";
import SessionComplete from "./learn/SessionComplete";
import GradeButtons from "./learn/GradeButtons";
import NavigationButtons from "./learn/NavigationButtons";
import { LearnSessionProps, ViewWidth, viewWidthClasses } from "./learn/types";

export default function LearnSession({ cards, categories, subcategories, onMarkRead, onReviewSection, onBack, onEdit, dueCount = 0 }: LearnSessionProps) {
  // Setup state
  const [setupStep, setSetupStep] = useState<"mode" | "filter" | "ready">("mode");
  const [learnMode, setLearnMode] = useState<LearnMode>("free");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"order" | "weakest" | "leastRead">("order");
  const [started, setStarted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Session state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [readCards, setReadCards] = useState<Set<string>>(new Set());

  // Free mode state
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  // Active Recall state
  const [arPhase, setArPhase] = useState<"preview" | "drill">("preview");
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillRevealed, setDrillRevealed] = useState(false);
  const [completedCards, setCompletedCards] = useState<Set<string>>(new Set());

  // Chain state
  const [chainIndex, setChainIndex] = useState(0);
  const [chainPhase, setChainPhase] = useState<"learn" | "chainReview">("learn");
  const [chainReviewIndex, setChainReviewIndex] = useState(0);
  const [chainRevealed, setChainRevealed] = useState(false);
  const [chainCompletedCards, setChainCompletedCards] = useState<Set<string>>(new Set());

  // Persistence
  const [progress, setProgress] = useState<Record<string, LearnCardProgress>>(() => loadLearnProgress());

  // Session statistics
  const [sessionStartTime] = useState(() => Date.now());
  const [totalGrades, setTotalGrades] = useState<number[]>([]);
  const [modulesCompleted, setModulesCompleted] = useState(0);
  const [chainResets, setChainResets] = useState(0);
  const activityLoggedRef = useRef(false);

  useEffect(() => {
    saveLearnProgress(progress);
  }, [progress]);

  const availableCategories = useMemo(() => {
    const cats = new Set(cards.map((c) => c.category));
    return categories.filter((c) => cats.has(c));
  }, [cards, categories]);

  const availableSubs = selectedCategory ? (subcategories[selectedCategory] || []) : [];

  const sortedCards = useMemo(() => {
    let filtered = selectedCategory ? cards.filter((c) => c.category === selectedCategory) : [...cards];
    if (selectedSubcategory) {
      filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    }
    if (selectedChapter) {
      filtered = filtered.filter((c) => c.chapter === selectedChapter);
    }
    if (learnMode === "chain") {
      filtered = filtered.filter((c) => c.type === "essay" && c.sections.length >= 3);
    }
    switch (sortMode) {
      case "weakest":
        return filtered.sort((a, b) => getCardScore(a) - getCardScore(b));
      case "leastRead":
        return filtered.sort((a, b) => (a.readCount || 0) - (b.readCount || 0));
      case "order":
      default:
        return filtered.sort((a, b) => {
          // Sort by chapterOrder within same chapter
          if (a.chapter && b.chapter && a.chapter === b.chapter) {
            return (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0);
          }
          return a.createdAt - b.createdAt;
        });
    }
  }, [cards, selectedCategory, selectedSubcategory, selectedChapter, sortMode, learnMode]);

  const card = sortedCards[currentIndex];

  // Restore progress when switching cards
  useEffect(() => {
    if (!card || !started) return;
    const p = progress[card.id];
    if (p && p.mode === learnMode && !p.completed) {
      if (learnMode === "active-recall") {
        setArPhase(p.phase as "preview" | "drill");
        setDrillIndex(p.currentModule);
        setDrillRevealed(false);
      } else if (learnMode === "chain") {
        setChainPhase(p.phase as "learn" | "chainReview");
        setChainIndex(p.currentModule);
        setChainReviewIndex(p.chainPosition);
        setChainRevealed(false);
      }
    } else {
      if (learnMode === "active-recall") {
        setArPhase("preview");
        setDrillIndex(0);
        setDrillRevealed(false);
      } else if (learnMode === "chain") {
        setChainPhase("learn");
        setChainIndex(0);
        setChainReviewIndex(0);
        setChainRevealed(false);
      }
      setExpandedSections(new Set());
    }
  }, [card?.id, started, learnMode]);

  const updateProgress = useCallback((cardId: string, update: Partial<LearnCardProgress>) => {
    setProgress((prev) => {
      const existing = prev[cardId] || { mode: learnMode, currentModule: 0, completedModules: [], chainPosition: 0, phase: "preview", completed: false };
      return { ...prev, [cardId]: { ...existing, ...update } };
    });
  }, [learnMode]);

  const goToCard = useCallback((index: number) => {
    setCurrentIndex(index);
    setExpandedSections(new Set());
    setDrillRevealed(false);
    setChainRevealed(false);
  }, []);

  const goNext = useCallback(() => { if (currentIndex + 1 < sortedCards.length) goToCard(currentIndex + 1); }, [currentIndex, sortedCards.length, goToCard]);
  const goPrev = useCallback(() => { if (currentIndex > 0) goToCard(currentIndex - 1); }, [currentIndex, goToCard]);

  // Keyboard shortcut: "e" to edit current card in free mode
  useEffect(() => {
    if (!started || learnMode !== "free" || !card || !onEdit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
        onEdit(card);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [started, learnMode, card, onEdit]);


  // ═══════════════════════════════════════════════════════════════

  if (!started) {
    if (setupStep === "mode") {
      const chainCount = cards.filter((c) => c.type === "essay" && c.sections.length >= 3).length;
      const modes: { key: LearnMode; label: string; level: string; levelColor: string; desc: string; tip: string; icon: typeof BookOpen }[] = [
        { key: "free", label: "Slobodno učenje", level: "Lak", levelColor: "bg-success/15 text-success", desc: "Prolazi kroz materijal svojim tempom. Čitaj i označavaj pročitano.", tip: "Idealno za prvi susret sa gradivom — bez pritiska ocjenjivanja. Kartica se označava kao pročitana i postaje dostupna za ponavljanje.", icon: BookOpen },
        { key: "active-recall", label: "Aktivno prisjećanje", level: "Srednji", levelColor: "bg-warning/15 text-warning", desc: "Pregledaj pa reprodukuj. Ocijeni svoje znanje za svaki modul.", tip: "Naučno najefektivniji metod učenja. Pokušaj odgovoriti prije otkrivanja — ocjena direktno utiče na FSRS algoritam i buduće intervale ponavljanja.", icon: Brain },
        { key: "chain", label: "Metod lanca", level: "Teški", levelColor: "bg-destructive/15 text-destructive", desc: "Snowball tehnika: ponovi cijeli lanac modula bez greške.", tip: "Kumulativno ponavljanje: svaki novi modul zahtijeva reprodukciju svih prethodnih. Gradi čvrste veze između koncepata — savršeno za složene teme.", icon: Link2 },
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  Preporučujemo da prvo ponovite bar polovinu dospjelih kartica prije učenja novog materijala.
                </p>
              </div>
            </motion.div>
          )}

          {/* Focus ratio warning */}
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
                    Preporučujemo da prvo ponavljaš dospjele kartice prije učenja novog materijala.
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
                className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title="Vodič kroz režime učenja">
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
                  <div className={`p-3 rounded-xl ${levelColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
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

    // Step 2: Category/subcategory filter + sort + start
    const sortOptions = [
      { key: "order" as const, label: "Hronološki", desc: "Kronološkim redoslijedom", icon: ListOrdered },
      { key: "weakest" as const, label: "Najslabija", desc: "Najniži rezultat prvo", icon: TrendingDown },
      { key: "leastRead" as const, label: "Najmanje čitana", desc: "Nepročitana prvo", icon: Eye },
    ];

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
        <div>
          <button onClick={() => setSetupStep("mode")} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
            <ArrowLeft className="h-4 w-4" /> Nazad na režime
          </button>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-serif">
              {learnMode === "free" ? "Slobodno učenje" : learnMode === "active-recall" ? "Aktivno prisjećanje" : "Metod lanca"}
            </h2>
          </div>
          <p className="text-muted-foreground">{sortedCards.length} pitanja dostupno.</p>
        </div>

        {availableCategories.length >= 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Kategorija</label>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!selectedCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                Sve
              </button>
              {availableCategories.map((c) => (
                <button key={c} onClick={() => { setSelectedCategory(c); setSelectedSubcategory(null); }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedCategory && availableSubs.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Podkategorija</label>
            <ScrollableRow>
              <button onClick={() => setSelectedSubcategory(null)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selectedSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                Sve podkat.
              </button>
              {availableSubs.map((sc) => (
                <button key={sc} onClick={() => setSelectedSubcategory(sc)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${selectedSubcategory === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {sc}
                </button>
              ))}
            </ScrollableRow>
          </div>
        )}

        {selectedSubcategory && (() => {
          const chaptersInSub = Array.from(new Set(
            cards.filter(c => c.category === selectedCategory && c.subcategory === selectedSubcategory && c.chapter)
              .map(c => c.chapter!)
          )).sort();
          if (chaptersInSub.length === 0) return null;
          return (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Glava</label>
              <ScrollableRow>
                <button onClick={() => setSelectedChapter(null)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selectedChapter ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  Sve glave
                </button>
                {chaptersInSub.map((ch) => (
                  <button key={ch} onClick={() => setSelectedChapter(ch)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${selectedChapter === ch ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                    {ch}
                  </button>
                ))}
              </ScrollableRow>
            </div>
          );
        })()}

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
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
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

  // ═══════════════════════════════════════════════════════════════
  // FINISHED STATE
  // ═══════════════════════════════════════════════════════════════

  if (!card) {
    // Log activity (once only)
    const elapsed = Date.now() - sessionStartTime;
    if (!activityLoggedRef.current && elapsed > 5000) {
      activityLoggedRef.current = true;
      const activityType = learnMode === "free" ? "learn-free" as const
        : learnMode === "active-recall" ? "learn-active" as const
        : "learn-chain" as const;
      addActivityEntry({ timestamp: Date.now(), type: activityType, durationMs: elapsed });

      // Record discipline for today
      try {
        const reviewLog = loadReviewLog();
        const plannerConfig = loadPlanner();
        const totalSections = cards.reduce((s, c) => s + c.sections.length, 0);
        const learnedSections = cards.reduce((s, c) => s + c.sections.filter(sec => sec.lastReviewed).length, 0);
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
        learnMode={learnMode}
        sessionStartTime={sessionStartTime}
        totalGrades={totalGrades}
        modulesCompleted={modulesCompleted}
        chainResets={chainResets}
        readCardsCount={readCards.size}
        completedCardsCount={completedCards.size}
        chainCompletedCardsCount={chainCompletedCards.size}
        onBack={onBack}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MODE: SLOBODNO UČENJE (Free Learning)
  // ═══════════════════════════════════════════════════════════════

  if (learnMode === "free") {
    const isRead = readCards.has(card.id);
    const toggleSection = (i: number) => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        next.has(i) ? next.delete(i) : next.add(i);
        return next;
      });
    };
    const showAll = () => setExpandedSections(new Set(card.sections.map((_, i) => i)));
    const handleMarkRead = () => {
      onMarkRead(card.id);
      setReadCards((prev) => new Set(prev).add(card.id));
    };
    const isFlash = card.type === "flash";

    return (
      <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
        <SessionHeader card={card} currentIndex={currentIndex} totalCards={sortedCards.length}
          learnMode={learnMode} viewWidth={viewWidth} setViewWidth={setViewWidth} onBack={() => setStarted(false)} />
        <QuestionDots cards={sortedCards} currentIndex={currentIndex} learnMode={learnMode}
          completedCards={completedCards} chainCompletedCards={chainCompletedCards} readCards={readCards} onSelect={goToCard} />

        <AnimatePresence mode="wait">
          <motion.div key={card.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }} className="space-y-4">
            {isFlash ? (
              <TextSelectionTooltip cardId={card.id} question={card.question} category={card.category} subcategory={card.subcategory} tags={card.tags}>
              <div className="rounded-xl border bg-card overflow-hidden">
                <button onClick={() => toggleSection(0)} className="w-full flex items-center gap-2 p-4 text-left hover:bg-secondary/30 transition-colors">
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSections.has(0) ? "rotate-90" : ""}`} />
                  <span className="font-medium text-sm">Odgovor</span>
                </button>
                {expandedSections.has(0) && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="px-4 pb-4 border-t">
                    <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: card.sections[0]?.content || "" }} />
                  </motion.div>
                )}
              </div>
              </TextSelectionTooltip>
            ) : (
              <TextSelectionTooltip cardId={card.id} question={card.question} category={card.category} subcategory={card.subcategory} tags={card.tags}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{card.sections.length} cjelina</span>
                  <button onClick={showAll} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Prikaži sve
                  </button>
                </div>
                {card.sections.map((section, i) => (
                  <div key={section.id} className="rounded-xl border bg-card overflow-hidden">
                    <button onClick={() => toggleSection(i)} className="w-full flex items-center gap-2 p-4 text-left hover:bg-secondary/30 transition-colors">
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSections.has(i) ? "rotate-90" : ""}`} />
                      <span className="font-medium text-sm">{section.title}</span>
                    </button>
                    {expandedSections.has(i) && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="px-4 pb-4 border-t">
                        <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: section.content }} />
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>
              </TextSelectionTooltip>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" /> Prethodna
              </Button>
              {onEdit && (
                <Button variant="ghost" size="icon" onClick={() => onEdit(card)} title="Uredi karticu (E)" className="shrink-0">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {!isRead ? (
                <Button onClick={() => { handleMarkRead(); goNext(); }} className="flex-1">
                  <Check className="h-4 w-4 mr-2" /> Pročitano
                </Button>
              ) : (
                <Button variant="outline" onClick={goNext} disabled={currentIndex + 1 >= sortedCards.length} className="flex-1">
                  Sljedeća <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MODE: AKTIVNO PRISJEĆANJE (Active Recall)
  // ═══════════════════════════════════════════════════════════════

  if (learnMode === "active-recall") {
    const sections = card.sections;
    const isCompleted = completedCards.has(card.id);

    const handleArGrade = (grade: number) => {
      const section = sections[drillIndex];
      if (!section) return;
      onReviewSection(card.id, section.id, grade);
      setTotalGrades((prev) => [...prev, grade]);

      if (grade === 4) {
        setModulesCompleted((c) => c + 1);
        const nextIdx = drillIndex + 1;
        if (nextIdx >= sections.length) {
          setCompletedCards((prev) => new Set(prev).add(card.id));
          updateProgress(card.id, { completed: true, currentModule: 0, phase: "drill" });
        } else {
          setDrillIndex(nextIdx);
          setDrillRevealed(false);
          updateProgress(card.id, { currentModule: nextIdx, phase: "drill" });
        }
      } else {
        setDrillRevealed(false);
      }
    };

    const startDrill = () => {
      setArPhase("drill");
      setDrillIndex(0);
      setDrillRevealed(false);
      onMarkRead(card.id);
      updateProgress(card.id, { mode: "active-recall", phase: "drill", currentModule: 0, completedModules: [], chainPosition: 0, completed: false });
    };

    return (
      <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
        <SessionHeader card={card} currentIndex={currentIndex} totalCards={sortedCards.length}
          learnMode={learnMode} viewWidth={viewWidth} setViewWidth={setViewWidth} onBack={() => setStarted(false)} />
        <QuestionDots cards={sortedCards} currentIndex={currentIndex} learnMode={learnMode}
          completedCards={completedCards} chainCompletedCards={chainCompletedCards} readCards={readCards} onSelect={goToCard} />

        <AnimatePresence mode="wait">
          <motion.div key={`${card.id}-${arPhase}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }} className="space-y-4">

            {arPhase === "preview" && !isCompleted && (
              <>
                <TextSelectionTooltip cardId={card.id} question={card.question} category={card.category} subcategory={card.subcategory} tags={card.tags}>
                <div className="space-y-3">
                  <span className="text-sm text-muted-foreground">{sections.length} modula — pročitaj pažljivo</span>
                  {sections.map((section) => (
                    <div key={section.id} className="rounded-xl border bg-card p-4">
                      <p className="font-medium text-sm mb-2">{section.title}</p>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: section.content }} />
                    </div>
                  ))}
                </div>
                </TextSelectionTooltip>
                <Button onClick={startDrill} className="w-full py-5">
                  <Check className="h-4 w-4 mr-2" /> Pročitano — počni drill
                </Button>
              </>
            )}

            {arPhase === "drill" && !isCompleted && (
              <>
                <div className="flex items-center gap-2">
                  {sections.map((_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${
                      i < drillIndex ? "bg-success" : i === drillIndex ? "bg-primary" : "bg-secondary"
                    }`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center">Modul {drillIndex + 1} od {sections.length}</p>

                <div className="rounded-xl border bg-card p-6 space-y-4">
                  <p className="font-medium">{sections[drillIndex].title}</p>
                  {!drillRevealed ? (
                    <div className="space-y-3">
                      <p className="text-sm text-center text-primary/80 italic py-4">🎙️ Pokušaj ponoviti pitanje na glas</p>
                      <Button onClick={() => setDrillRevealed(true)} variant="outline" className="w-full">
                        <Eye className="h-4 w-4 mr-2" /> Otkrij odgovor
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-secondary/50 p-4">
                        <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: sections[drillIndex].content }} />
                      </div>
                      <GradeButtons onGrade={handleArGrade} hint="Ocijeni svoje znanje (samo 4 = napredak)" />
                    </div>
                  )}
                </div>
              </>
            )}

            {isCompleted && (
              <div className="rounded-xl border bg-success/10 border-success/30 p-8 text-center space-y-3">
                <Check className="h-8 w-8 text-success mx-auto" />
                <p className="font-serif text-lg">Pitanje savladano!</p>
                <p className="text-sm text-muted-foreground">Svi moduli su uspješno reprodukovani.</p>
              </div>
            )}

            <NavigationButtons currentIndex={currentIndex} totalCards={sortedCards.length} onPrev={goPrev} onNext={goNext} />
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MODE: METOD LANCA (Chain Method)
  // ═══════════════════════════════════════════════════════════════

  if (learnMode === "chain") {
    const sections = card.sections;
    const isChainCompleted = chainCompletedCards.has(card.id);

    const handleChainGrade = (grade: number) => {
      const section = sections[chainIndex];
      if (!section) return;
      onReviewSection(card.id, section.id, grade);
      setTotalGrades((prev) => [...prev, grade]);

      if (grade === 4) {
        setModulesCompleted((c) => c + 1);
        if (chainIndex === 0) {
          const nextIdx = chainIndex + 1;
          if (nextIdx >= sections.length) {
            setChainCompletedCards((prev) => new Set(prev).add(card.id));
            updateProgress(card.id, { completed: true });
          } else {
            setChainIndex(nextIdx);
            setChainRevealed(false);
            updateProgress(card.id, { currentModule: nextIdx, phase: "learn", chainPosition: 0 });
          }
        } else {
          setChainPhase("chainReview");
          setChainReviewIndex(0);
          setChainRevealed(false);
          updateProgress(card.id, { phase: "chainReview", chainPosition: 0 });
        }
      } else {
        setChainRevealed(false);
      }
    };

    const handleChainReviewGrade = (grade: number) => {
      const section = sections[chainReviewIndex];
      if (!section) return;
      onReviewSection(card.id, section.id, grade);
      setTotalGrades((prev) => [...prev, grade]);

      if (grade <= 2) {
        setChainResets((c) => c + 1);
        setChainPhase("learn");
        setChainIndex(0);
        setChainReviewIndex(0);
        setChainRevealed(false);
        updateProgress(card.id, { currentModule: 0, phase: "learn", chainPosition: 0 });
      } else {
        const nextReviewIdx = chainReviewIndex + 1;
        if (nextReviewIdx > chainIndex) {
          const nextModuleIdx = chainIndex + 1;
          if (nextModuleIdx >= sections.length) {
            setChainCompletedCards((prev) => new Set(prev).add(card.id));
            updateProgress(card.id, { completed: true });
          } else {
            setChainPhase("learn");
            setChainIndex(nextModuleIdx);
            setChainRevealed(false);
            updateProgress(card.id, { currentModule: nextModuleIdx, phase: "learn", chainPosition: 0 });
          }
        } else {
          setChainReviewIndex(nextReviewIdx);
          setChainRevealed(false);
          updateProgress(card.id, { chainPosition: nextReviewIdx });
        }
      }
    };

    return (
      <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
        <SessionHeader card={card} currentIndex={currentIndex} totalCards={sortedCards.length}
          learnMode={learnMode} viewWidth={viewWidth} setViewWidth={setViewWidth} onBack={() => setStarted(false)} />
        <QuestionDots cards={sortedCards} currentIndex={currentIndex} learnMode={learnMode}
          completedCards={completedCards} chainCompletedCards={chainCompletedCards} readCards={readCards} onSelect={goToCard} />

        <AnimatePresence mode="wait">
          <motion.div key={`${card.id}-${chainPhase}-${chainIndex}-${chainReviewIndex}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }} className="space-y-4">

            {!isChainCompleted && (
              <>
                <div className="flex items-center gap-2">
                  {sections.map((_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${
                      i < chainIndex ? "bg-success"
                        : i === chainIndex ? (chainPhase === "learn" ? "bg-primary" : "bg-warning")
                        : "bg-secondary"
                    }`} />
                  ))}
                </div>

                {chainPhase === "learn" ? (
                  <>
                    <p className="text-xs text-muted-foreground text-center">Novi modul: {chainIndex + 1} od {sections.length}</p>
                    <div className="rounded-xl border bg-card p-6 space-y-4">
                      <p className="font-medium">{sections[chainIndex].title}</p>
                      {!chainRevealed ? (
                        <div className="space-y-3">
                          <p className="text-sm text-center text-primary/80 italic py-4">🎙️ Pokušaj ponoviti pitanje na glas</p>
                          <Button onClick={() => setChainRevealed(true)} variant="outline" className="w-full">
                            <Eye className="h-4 w-4 mr-2" /> Otkrij odgovor
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="rounded-lg bg-secondary/50 p-4">
                            <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: sections[chainIndex].content }} />
                          </div>
                          <GradeButtons onGrade={handleChainGrade} hint="Ocijeni (samo 4 = napredak)" />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-center">
                      <p className="text-sm font-medium text-warning flex items-center justify-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Ponavljanje lanca: modul {chainReviewIndex + 1} od {chainIndex + 1}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">🎙️ Pokušaj ponoviti cijeli lanac na glas</p>
                    </div>

                    <div className="rounded-xl border bg-card p-6 space-y-4">
                      <p className="font-medium">{sections[chainReviewIndex].title}</p>
                      {!chainRevealed ? (
                        <div className="space-y-3">
                          <div className="py-6 text-center text-muted-foreground text-sm italic">Reprodukuj sadržaj ovog modula...</div>
                          <Button onClick={() => setChainRevealed(true)} variant="outline" className="w-full">
                            <Eye className="h-4 w-4 mr-2" /> Otkrij odgovor
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="rounded-lg bg-secondary/50 p-4">
                            <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: sections[chainReviewIndex].content }} />
                          </div>
                          <GradeButtons onGrade={handleChainReviewGrade} hint="Bilo šta ispod 4 = reset na modul 1" />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {isChainCompleted && (
              <div className="rounded-xl border bg-success/10 border-success/30 p-8 text-center space-y-3">
                <Link2 className="h-8 w-8 text-success mx-auto" />
                <p className="font-serif text-lg">Lanac završen!</p>
                <p className="text-sm text-muted-foreground">Svi moduli su savršeno reprodukovani u nizu.</p>
              </div>
            )}

            <NavigationButtons currentIndex={currentIndex} totalCards={sortedCards.length} onPrev={goPrev} onNext={goNext} />
            <Button onClick={onBack} variant="outline" className="w-full mt-2 border-primary/30 text-primary hover:bg-primary/5">
              <Check className="h-4 w-4 mr-2" /> Zaključi sesiju i sačuvaj
            </Button>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return null;
}
