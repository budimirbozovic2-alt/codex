import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, getCardScore, getDueCards } from "@/lib/spaced-repetition";
import { LearnMode, LearnCardProgress, loadLearnProgress, saveLearnProgress } from "@/lib/storage";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, ChevronRight, BookOpen, Check, Eye, TrendingDown,
  ListOrdered, Zap, Volume2, Brain, Link2, RotateCcw, HelpCircle,
  Clock, Target, BarChart3, RotateCw, Trophy, AlertTriangle
} from "lucide-react";
import ScrollableRow from "@/components/ScrollableRow";
import { Button } from "@/components/ui/button";
import { speak } from "@/lib/tts";
import LearnOnboarding, { hasSeenOnboarding } from "@/components/LearnOnboarding";

type SortMode = "order" | "weakest" | "leastRead";
type ViewWidth = "compact" | "normal" | "wide" | "full";
type SetupStep = "mode" | "filter" | "ready";

const viewWidthClasses: Record<ViewWidth, string> = {
  compact: "max-w-xl",
  normal: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-full",
};

const viewWidthLabels: Record<ViewWidth, string> = {
  compact: "S",
  normal: "M",
  wide: "L",
  full: "XL",
};

interface Props {
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  onMarkRead: (id: string) => void;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onBack: () => void;
  dueCount?: number;
}

const GRADE_LABELS = ["", "Ponovo", "Teško", "Dobro", "Lako"];
const GRADE_DESCRIPTIONS = [
  "",
  "Potpuno nepoznat",
  "Propuštene ključne info",
  "Poznat + ključne info",
  "1/1 bez oklijevanja",
];
const GRADE_COLORS = [
  "",
  "bg-destructive text-destructive-foreground",
  "bg-warning text-warning-foreground",
  "bg-primary text-primary-foreground",
  "bg-success text-success-foreground",
];

export default function LearnSession({ cards, categories, subcategories, onMarkRead, onReviewSection, onBack, dueCount = 0 }: Props) {
  // Setup state
  const [setupStep, setSetupStep] = useState<SetupStep>("mode");
  const [learnMode, setLearnMode] = useState<LearnMode>("free");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [started, setStarted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());

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
    // Chain mode: only essay cards with ≥3 sections
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
        return filtered.sort((a, b) => a.createdAt - b.createdAt);
    }
  }, [cards, selectedCategory, selectedSubcategory, sortMode, learnMode]);

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
      // Reset state for new card
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

  const goNext = () => { if (currentIndex + 1 < sortedCards.length) goToCard(currentIndex + 1); };
  const goPrev = () => { if (currentIndex > 0) goToCard(currentIndex - 1); };

  // ═══════════════════════════════════════════════════════════════
  // SETUP SCREENS
  // ═══════════════════════════════════════════════════════════════

  if (!started) {
    // Step 1: Mode selection
    if (setupStep === "mode") {
      const chainCount = cards.filter((c) => c.type === "essay" && c.sections.length >= 3).length;
      const modes: { key: LearnMode; label: string; level: string; levelColor: string; desc: string; icon: typeof BookOpen }[] = [
        { key: "free", label: "Slobodno učenje", level: "Lak", levelColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", desc: "Prolazi kroz materijal svojim tempom. Čitaj i označavaj pročitano.", icon: BookOpen },
        { key: "active-recall", label: "Aktivno prisjećanje", level: "Srednji", levelColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400", desc: "Pregledaj pa reprodukuj. Ocijeni svoje znanje za svaki modul.", icon: Brain },
        { key: "chain", label: "Metod lanca", level: "Teški", levelColor: "bg-destructive/15 text-destructive", desc: "Snowball tehnika: ponovi cijeli lanac modula bez greške.", icon: Link2 },
      ];

      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
          <AnimatePresence>
            {showOnboarding && <LearnOnboarding onComplete={() => setShowOnboarding(false)} />}
          </AnimatePresence>

          {dueCount > 50 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5"
            >
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Previše dospjelih kartica ({dueCount})</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Preporučujemo da prvo ponovite bar polovinu dospjelih kartica prije učenja novog materijala.
                </p>
              </div>
            </motion.div>
          )}
          <div>
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
              <ArrowLeft className="h-4 w-4" /> Nazad
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-serif">Učenje</h2>
                <p className="text-muted-foreground mt-2">Izaberi režim učenja koji odgovara tvom nivou.</p>
              </div>
              <button
                onClick={() => setShowOnboarding(true)}
                className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title="Vodič kroz režime učenja"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            {modes.map(({ key, label, level, levelColor, desc, icon: Icon }) => {
              const disabled = key === "chain" && chainCount === 0;
              return (
                <button
                  key={key}
                  onClick={() => { if (!disabled) { setLearnMode(key); setSetupStep("filter"); } }}
                  disabled={disabled}
                  className={`rounded-xl border p-5 text-left transition-all flex items-start gap-4 ${
                    disabled ? "opacity-40 cursor-not-allowed" : "hover:border-primary/50 hover:shadow-sm cursor-pointer"
                  } ${learnMode === key ? "border-primary bg-primary/5" : "bg-card"}`}
                >
                  <div className={`p-3 rounded-xl ${levelColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold">{label}</p>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${levelColor}`}>
                        {level}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{desc}</p>
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
    const sortOptions: { key: SortMode; label: string; desc: string; icon: typeof ListOrdered }[] = [
      { key: "order", label: "Hronološki", desc: "Kronološkim redoslijedom", icon: ListOrdered },
      { key: "weakest", label: "Najslabija", desc: "Najniži rezultat prvo", icon: TrendingDown },
      { key: "leastRead", label: "Najmanje čitana", desc: "Nepročitana prvo", icon: Eye },
    ];
    const filteredCount = sortedCards.length;

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
          <p className="text-muted-foreground">{filteredCount} pitanja dostupno.</p>
        </div>

        {/* Category filter */}
        {availableCategories.length >= 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Kategorija</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!selectedCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
              >
                Sve
              </button>
              {availableCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => { setSelectedCategory(c); setSelectedSubcategory(null); }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subcategory filter */}
        {selectedCategory && availableSubs.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Podkategorija</label>
            <ScrollableRow>
              <button
                onClick={() => setSelectedSubcategory(null)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selectedSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
              >
                Sve podkat.
              </button>
              {availableSubs.map((sc) => (
                <button
                  key={sc}
                  onClick={() => setSelectedSubcategory(sc)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${selectedSubcategory === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  {sc}
                </button>
              ))}
            </ScrollableRow>
          </div>
        )}

        {/* Sort */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Redoslijed</label>
          <div className="grid gap-2">
            {sortOptions.map(({ key, label, desc, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSortMode(key)}
                className={`rounded-xl border p-3 text-left transition-colors flex items-center gap-3 ${
                  sortMode === key ? "border-primary bg-primary/5" : "bg-card hover:border-primary/50"
                }`}
              >
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

        <Button onClick={() => setStarted(true)} className="w-full py-6 text-base" disabled={filteredCount === 0}>
          <BookOpen className="h-4 w-4 mr-2" /> Počni učenje
        </Button>
      </motion.div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // FINISHED STATE
  // ═══════════════════════════════════════════════════════════════

  if (!card) {
    const elapsed = Date.now() - sessionStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const avgGrade = totalGrades.length > 0 ? (totalGrades.reduce((a, b) => a + b, 0) / totalGrades.length).toFixed(1) : "—";

    const statItems: { icon: typeof Clock; label: string; value: string | number }[] = [
      { icon: Clock, label: "Vrijeme", value: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s` },
      { icon: Target, label: "Modula savladano", value: modulesCompleted },
      { icon: BarChart3, label: "Prosječna ocjena", value: avgGrade },
    ];

    if (learnMode === "free") {
      statItems[1] = { icon: BookOpen, label: "Pročitano", value: readCards.size };
    } else if (learnMode === "active-recall") {
      statItems.push({ icon: Trophy, label: "Pitanja savladana", value: completedCards.size });
    } else if (learnMode === "chain") {
      statItems.push({ icon: Trophy, label: "Lanci završeni", value: chainCompletedCards.size });
      statItems.push({ icon: RotateCw, label: "Resetovanja lanca", value: chainResets });
    }

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto space-y-8 py-16">
        <div className="text-center space-y-3">
          <div className="inline-flex p-4 rounded-2xl bg-primary/10 mb-2">
            <Trophy className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-4xl font-serif italic">Svaka čast!</h2>
          <p className="text-muted-foreground text-lg">Sesija završena.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {statItems.map(({ icon: StatIcon, label, value }) => (
            <div key={label} className="rounded-xl border bg-card p-4 text-center space-y-1">
              <StatIcon className="h-5 w-5 text-muted-foreground mx-auto" />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {totalGrades.length > 0 && (
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground text-center">Distribucija ocjena</p>
            <div className="flex items-end justify-center gap-3 h-16">
              {[1, 2, 3, 4].map((g) => {
                const count = totalGrades.filter((x) => x === g).length;
                const pct = totalGrades.length > 0 ? (count / totalGrades.length) * 100 : 0;
                return (
                  <div key={g} className="flex flex-col items-center gap-1">
                    <div
                      className={`w-8 rounded-t-md transition-all ${g === 1 ? "bg-destructive/70" : g === 2 ? "bg-orange-400/70" : g === 3 ? "bg-primary/70" : "bg-emerald-500/70"}`}
                      style={{ height: `${Math.max(4, pct * 0.6)}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground">{GRADE_LABELS[g]}</span>
                    <span className="text-xs font-medium">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button onClick={onBack} variant="outline" className="w-full">
          <ArrowLeft className="h-4 w-4 mr-2" /> Nazad na početnu
        </Button>
      </motion.div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SESSION HEADER (shared across all modes)
  // ═══════════════════════════════════════════════════════════════

  const score = getCardScore(card);
  const isFlash = card.type === "flash";

  const renderHeader = () => (
    <>
      <div className="flex items-center justify-between">
        <button onClick={() => setStarted(false)} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground">
            {learnMode === "free" ? "Slobodno" : learnMode === "active-recall" ? "Aktivno" : "Lanac"}
          </span>
          <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
            {(Object.keys(viewWidthClasses) as ViewWidth[]).map((w) => (
              <button
                key={w}
                onClick={() => setViewWidth(w)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewWidth === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {viewWidthLabels[w]}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} / {sortedCards.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: `${((currentIndex + 1) / sortedCards.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Card question header */}
      <div className="rounded-xl bg-card border p-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
            {card.subcategory && <span className="text-xs text-muted-foreground">› {card.subcategory}</span>}
            {isFlash && (
              <span className="text-xs text-primary flex items-center gap-1"><Zap className="h-3 w-3" /> Blic</span>
            )}
            {(card.tags || []).includes("često-na-ispitu") && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">Često na ispitu</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="px-2 py-1 rounded-md bg-secondary">Snaga: {score}%</span>
            <span className="px-2 py-1 rounded-md bg-secondary">Pročitano: {card.readCount || 0}×</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xl leading-relaxed font-serif flex-1">{card.question}</p>
          <button onClick={() => speak(card.question)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Pročitaj naglas">
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════════
  // QUESTION LIST SIDEBAR (with completion status colors)
  // ═══════════════════════════════════════════════════════════════

  const renderQuestionList = () => {
    if (sortedCards.length <= 1) return null;
    return (
      <div className="flex gap-1.5 flex-wrap mb-4">
        {sortedCards.map((c, i) => {
          const isActive = i === currentIndex;
          const isCompletedAR = completedCards.has(c.id);
          const isCompletedChain = chainCompletedCards.has(c.id);
          const isRead = readCards.has(c.id);

          let dotColor = "bg-secondary";
          if (learnMode === "active-recall" && isCompletedAR) dotColor = "bg-emerald-400 dark:bg-emerald-500";
          else if (learnMode === "chain" && isCompletedChain) dotColor = "bg-emerald-700 dark:bg-emerald-600";
          else if (learnMode === "free" && isRead) dotColor = "bg-primary/40";

          return (
            <button
              key={c.id}
              onClick={() => goToCard(i)}
              className={`w-3 h-3 rounded-full transition-all ${dotColor} ${isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-125" : "hover:scale-110"}`}
              title={`${i + 1}. ${c.question.slice(0, 40)}`}
            />
          );
        })}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // MODE: SLOBODNO UČENJE (Free Learning) — existing behavior
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

    return (
      <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
        {renderHeader()}
        {renderQuestionList()}

        <AnimatePresence mode="wait">
          <motion.div key={card.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }} className="space-y-4">
            {isFlash ? (
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
            ) : (
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
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" /> Prethodna
              </Button>
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
          // All modules done
          setCompletedCards((prev) => new Set(prev).add(card.id));
          updateProgress(card.id, { completed: true, currentModule: 0, phase: "drill" });
        } else {
          setDrillIndex(nextIdx);
          setDrillRevealed(false);
          updateProgress(card.id, { currentModule: nextIdx, phase: "drill" });
        }
      } else {
        // Restart this module
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
        {renderHeader()}
        {renderQuestionList()}

        <AnimatePresence mode="wait">
          <motion.div key={`${card.id}-${arPhase}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }} className="space-y-4">

            {arPhase === "preview" && !isCompleted && (
              <>
                {/* Show all sections visible */}
                <div className="space-y-3">
                  <span className="text-sm text-muted-foreground">{sections.length} modula — pročitaj pažljivo</span>
                  {sections.map((section) => (
                    <div key={section.id} className="rounded-xl border bg-card p-4">
                      <p className="font-medium text-sm mb-2">{section.title}</p>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: section.content }} />
                    </div>
                  ))}
                </div>
                <Button onClick={startDrill} className="w-full py-5">
                  <Check className="h-4 w-4 mr-2" /> Pročitano — počni drill
                </Button>
              </>
            )}

            {arPhase === "drill" && !isCompleted && (
              <>
                {/* Module stepper */}
                <div className="flex items-center gap-2">
                  {sections.map((_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${
                      i < drillIndex ? "bg-emerald-500" : i === drillIndex ? "bg-primary" : "bg-secondary"
                    }`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center">Modul {drillIndex + 1} od {sections.length}</p>

                <div className="rounded-xl border bg-card p-6 space-y-4">
                  <p className="font-medium">{sections[drillIndex].title}</p>

                  {!drillRevealed ? (
                    <div className="space-y-3">
                      <p className="text-sm text-center text-primary/80 italic py-4">
                        🎙️ Pokušaj ponoviti pitanje na glas
                      </p>
                      <Button onClick={() => setDrillRevealed(true)} variant="outline" className="w-full">
                        <Eye className="h-4 w-4 mr-2" /> Otkrij odgovor
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-secondary/50 p-4">
                        <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: sections[drillIndex].content }} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 text-center">Ocijeni svoje znanje (samo 4 = napredak)</p>
                        <div className="grid grid-cols-4 gap-2">
                          {[1, 2, 3, 4].map((g) => (
                            <Button key={g} onClick={() => handleArGrade(g)} className={`${GRADE_COLORS[g]} border-0`} variant="outline">
                              {g} — {GRADE_LABELS[g]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {isCompleted && (
              <div className="rounded-xl border bg-emerald-500/10 border-emerald-500/30 p-8 text-center space-y-3">
                <Check className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="font-serif text-lg">Pitanje savladano!</p>
                <p className="text-sm text-muted-foreground">Svi moduli su uspješno reprodukovani.</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" /> Prethodna
              </Button>
              <Button variant="outline" onClick={goNext} disabled={currentIndex + 1 >= sortedCards.length} className="flex-1">
                Sljedeća <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
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
        // Module mastered → start chain review 1..chainIndex
        if (chainIndex === 0) {
          // First module, no chain to review, advance
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
          // Start chain review from module 0 to chainIndex
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

      if (grade < 4 && grade !== 3) {
        // Penalty: grade 1 or 2 resets the chain
        setChainResets((c) => c + 1);
        setChainPhase("learn");
        setChainIndex(0);
        setChainReviewIndex(0);
        setChainRevealed(false);
      } else if (grade === 3) {
        // Grade 3 (Good): pass but don't advance perfectly — no reset
        // Continue chain normally
        updateProgress(card.id, { currentModule: 0, phase: "learn", chainPosition: 0 });
      } else {
        const nextReviewIdx = chainReviewIndex + 1;
        if (nextReviewIdx > chainIndex) {
          // Chain review complete! Advance to next module
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
        {renderHeader()}
        {renderQuestionList()}

        <AnimatePresence mode="wait">
          <motion.div key={`${card.id}-${chainPhase}-${chainIndex}-${chainReviewIndex}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }} className="space-y-4">

            {!isChainCompleted && (
              <>
                {/* Chain stepper */}
                <div className="flex items-center gap-2">
                  {sections.map((_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${
                      i < chainIndex ? "bg-emerald-700 dark:bg-emerald-600"
                        : i === chainIndex ? (chainPhase === "learn" ? "bg-primary" : "bg-amber-500")
                        : "bg-secondary"
                    }`} />
                  ))}
                </div>

                {chainPhase === "learn" ? (
                  <>
                    <p className="text-xs text-muted-foreground text-center">
                      Novi modul: {chainIndex + 1} od {sections.length}
                    </p>
                    <div className="rounded-xl border bg-card p-6 space-y-4">
                      <p className="font-medium">{sections[chainIndex].title}</p>
                      {!chainRevealed ? (
                        <div className="space-y-3">
                          <p className="text-sm text-center text-primary/80 italic py-4">
                            🎙️ Pokušaj ponoviti pitanje na glas
                          </p>
                          <Button onClick={() => setChainRevealed(true)} variant="outline" className="w-full">
                            <Eye className="h-4 w-4 mr-2" /> Otkrij odgovor
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="rounded-lg bg-secondary/50 p-4">
                            <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: sections[chainIndex].content }} />
                          </div>
                          <p className="text-xs text-muted-foreground text-center">Ocijeni (samo 4 = napredak)</p>
                          <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 3, 4].map((g) => (
                              <Button key={g} onClick={() => handleChainGrade(g)} className={`${GRADE_COLORS[g]} border-0`} variant="outline">
                                {g} — {GRADE_LABELS[g]}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-center">
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center justify-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Ponavljanje lanca: modul {chainReviewIndex + 1} od {chainIndex + 1}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        🎙️ Pokušaj ponoviti cijeli lanac na glas
                      </p>
                    </div>

                    <div className="rounded-xl border bg-card p-6 space-y-4">
                      <p className="font-medium">{sections[chainReviewIndex].title}</p>
                      {!chainRevealed ? (
                        <div className="space-y-3">
                          <div className="py-6 text-center text-muted-foreground text-sm italic">
                            Reprodukuj sadržaj ovog modula...
                          </div>
                          <Button onClick={() => setChainRevealed(true)} variant="outline" className="w-full">
                            <Eye className="h-4 w-4 mr-2" /> Otkrij odgovor
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="rounded-lg bg-secondary/50 p-4">
                            <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: sections[chainReviewIndex].content }} />
                          </div>
                          <p className="text-xs text-muted-foreground text-center">Bilo šta ispod 4 = reset na modul 1</p>
                          <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 3, 4].map((g) => (
                              <Button key={g} onClick={() => handleChainReviewGrade(g)} className={`${GRADE_COLORS[g]} border-0`} variant="outline">
                                {g} — {GRADE_LABELS[g]}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {isChainCompleted && (
              <div className="rounded-xl border bg-emerald-700/10 border-emerald-700/30 p-8 text-center space-y-3">
                <Link2 className="h-8 w-8 text-emerald-700 dark:text-emerald-500 mx-auto" />
                <p className="font-serif text-lg">Lanac završen!</p>
                <p className="text-sm text-muted-foreground">Svi moduli su savršeno reprodukovani u nizu.</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" /> Prethodna
              </Button>
              <Button variant="outline" onClick={goNext} disabled={currentIndex + 1 >= sortedCards.length} className="flex-1">
                Sljedeća <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return null;
}
