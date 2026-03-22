import { useState, useMemo, useEffect, useCallback, useRef } from "react"; 
import { Card, Section, GRADES, getDueSections, isLeech, formatInterval, previewIntervals, SRSettings, DEFAULT_SR_SETTINGS, SectionState, getRetrievability } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, CheckCircle2 } from "lucide-react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as Eye } from "lucide-react/dist/esm/icons/eye";
import { default as ChevronRight } from "lucide-react/dist/esm/icons/chevron-right";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { default as HelpCircle } from "lucide-react/dist/esm/icons/help-circle";
import { default as ArrowRight } from "lucide-react/dist/esm/icons/arrow-right";
import { default as XIcon } from "lucide-react/dist/esm/icons/x";
import { default as Flame } from "lucide-react/dist/esm/icons/flame";
import { default as Zap } from "lucide-react/dist/esm/icons/zap";
import { default as Pause } from "lucide-react/dist/esm/icons/pause";
import { default as Play } from "lucide-react/dist/esm/icons/play";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { default as Shield } from "lucide-react/dist/esm/icons/shield";
import ScrollableRow from "@/components/ScrollableRow";
import { Button } from "@/components/ui/button";
import { speak, stopSpeaking } from "@/lib/tts";
import { useToast } from "@/hooks/use-toast";
import { addCalibrationEntry, addLatencyEntry, addActivityEntry } from "@/lib/metacognitive-storage";
import ShortcutsHint from "@/components/ShortcutsHint";
import OnboardingModal, { type OnboardingSlide, hasSeenOnboarding } from "@/components/OnboardingModal";

const REVIEW_SHORTCUTS = [
  { keys: "Space", description: "Otkrij odgovor" },
  { keys: "1-4", description: "Ocijeni (Opet → Lako)" },
  { keys: "Z", description: "Poništi zadnju ocjenu" },
  { keys: "N", description: "Zabilježi grešku" },
];

type ReviewMode = "stabilization" | "critical" | "hardest" | null;
type ViewWidth = "compact" | "normal" | "wide" | "full";

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

interface DueItem {
  card: Card;
  section: Section;
}

interface Props {
  dueCards: Card[];
  allCards: Card[];
  subcategories: Record<string, string[]>;
  srSettings: SRSettings;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onLogError: (cardId: string, text: string) => void;
  onBack: () => void;
}

export default function ReviewSession({ dueCards, allCards, subcategories, srSettings, onReviewSection, onLogError, onBack }: Props) {
  const [mode, setMode] = useState<ReviewMode>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [filterExamFrequent, setFilterExamFrequent] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [randomIndex, setRandomIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const reviewStartRef = useRef(Date.now());
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [showOnboarding, setShowOnboarding] = useState(
    () => !hasSeenOnboarding(REVIEW_ONBOARDING_KEY)
  );

  const dueCategories = useMemo(() => {
    const cats = new Set(dueCards.map((c) => c.category));
    return Array.from(cats).sort();
  }, [dueCards]);

  const filteredDueCards = useMemo(() => {
    let filtered = dueCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.category === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("često-na-ispitu"));
    return filtered;
  }, [dueCards, selectedCategory, selectedSubcategory, filterExamFrequent]);

  // Apply same category/tag filters to allCards
  const filteredAllCards = useMemo(() => {
    let filtered = allCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.category === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("često-na-ispitu"));
    return filtered;
  }, [allCards, selectedCategory, selectedSubcategory, filterExamFrequent]);

  // === MODE 1: Fokusirano Utvrđivanje (Stabilizacija) ===
  // Learning/Relearning sections with stability < 5, sorted by lowest stability
  const stabilizationItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    filteredDueCards.forEach((card) => {
      getDueSections(card).forEach((section) => {
        if (
          (section.state === SectionState.Learning || section.state === SectionState.Relearning) &&
          section.stability < 5
        ) {
          items.push({ card, section });
        }
      });
    });
    items.sort((a, b) => a.section.stability - b.section.stability);
    return items;
  }, [filteredDueCards]);

  // === MODE 2: Kritični Pregled (Zadržavanje) ===
  // Sections with retrievability between 80-85% (sweet spot)
  const criticalItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    filteredAllCards.forEach((card) => {
      card.sections.forEach((section) => {
        if (section.state === SectionState.New) return;
        const r = getRetrievability(section);
        if (r >= 80 && r <= 85) {
          items.push({ card, section });
        }
      });
    });
    // Sort by retrievability ascending (closest to forgetting first)
    items.sort((a, b) => getRetrievability(a.section) - getRetrievability(b.section));
    return items;
  }, [filteredAllCards]);

  // === MODE 3: Najteža Pitanja ===
  // All leech sections + top remaining by difficulty (D>7), capped at 50
  const hardestItems = useMemo<DueItem[]>(() => {
    const leechItems: DueItem[] = [];
    const highDiffItems: DueItem[] = [];

    filteredAllCards.forEach((card) => {
      card.sections.forEach((section) => {
        if (section.state === SectionState.New) return;
        if (isLeech(section, srSettings)) {
          leechItems.push({ card, section });
        } else if (section.difficulty > 7) {
          highDiffItems.push({ card, section });
        }
      });
    });

    // Sort high-diff by difficulty descending
    highDiffItems.sort((a, b) => b.section.difficulty - a.section.difficulty);

    // Combine: all leeches first, then fill up to 50 with high difficulty
    const combined = [...leechItems];
    const remaining = 50 - combined.length;
    if (remaining > 0) {
      combined.push(...highDiffItems.slice(0, remaining));
    }

    return combined.slice(0, 50);
  }, [filteredAllCards, srSettings]);

  // Count exam-frequent cards in due set
  const examFrequentCount = useMemo(() => {
    return dueCards.filter(c => c.tags?.includes("često-na-ispitu")).length;
  }, [dueCards]);

  // Session pause/resume
  const SESSION_KEY = "sr-review-session";

  const saveSessionState = useCallback(() => {
    if (mode === null || finished) return;
    const state = { mode, selectedCategory, selectedSubcategory, filterExamFrequent, cardIndex, sectionIndex, randomIndex, timestamp: Date.now() };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch (_) {}
  }, [mode, selectedCategory, selectedSubcategory, filterExamFrequent, cardIndex, sectionIndex, randomIndex, finished]);

  const clearSavedSession = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }, []);

  // Check for saved session on mount
  const [savedSession, setSavedSession] = useState<any>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < 2 * 60 * 60 * 1000) {
          setSavedSession(parsed);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (_) {}
  }, []);

  const resumeSession = useCallback(() => {
    if (!savedSession) return;
    // Map old mode names to new ones for backward compatibility
    let resumeMode = savedSession.mode;
    if (resumeMode === "essay") resumeMode = "stabilization";
    if (resumeMode === "random") resumeMode = "critical";
    if (resumeMode === "difficult") resumeMode = "hardest";
    setMode(resumeMode);
    setSelectedCategory(savedSession.selectedCategory);
    setSelectedSubcategory(savedSession.selectedSubcategory);
    setFilterExamFrequent(savedSession.filterExamFrequent || false);
    setCardIndex(savedSession.cardIndex || 0);
    setSectionIndex(savedSession.sectionIndex || 0);
    setRandomIndex(savedSession.randomIndex || 0);
    setSavedSession(null);
    clearSavedSession();
  }, [savedSession, clearSavedSession]);

  const handlePauseSession = useCallback(() => {
    saveSessionState();
    onBack();
  }, [saveSessionState, onBack]);

  const dueSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    const subs = new Set(dueCards.filter((c) => c.category === selectedCategory && c.subcategory).map((c) => c.subcategory!));
    return Array.from(subs).sort();
  }, [dueCards, selectedCategory]);

  // Log activity when session finishes
  useEffect(() => {
    if (finished) {
      addActivityEntry({ timestamp: Date.now(), type: "review", durationMs: Date.now() - reviewStartRef.current });
    }
  }, [finished]);

  // Clear saved session when session finishes
  useEffect(() => {
    if (finished) clearSavedSession();
  }, [finished, clearSavedSession]);

  const modeLabels: Record<string, string> = {
    stabilization: "Fokusirano Utvrđivanje",
    critical: "Kritični Pregled",
    hardest: "Najteža Pitanja",
  };

  if (mode === null) {
    const filteredCount = filteredDueCards.length;
    const filteredSections = filteredDueCards.reduce((sum, c) => sum + getDueSections(c).length, 0);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10 relative">
        <AnimatePresence>
          {showOnboarding && (
            <OnboardingModal
              slides={REVIEW_SLIDES}
              storageKey={REVIEW_ONBOARDING_KEY}
              onComplete={() => setShowOnboarding(false)}
              finishLabel="Počni"
            />
          )}
        </AnimatePresence>
        {/* Info corner */}
        <HowItWorksCorner onShowOnboarding={() => setShowOnboarding(true)} />

        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-serif">Konsolidacija</h2>
          <p className="text-muted-foreground mt-2">
            {filteredCount} kartica · {filteredSections} {filteredSections === 1 ? "sekcija dospjela" : "sekcija dospjelo"} za učvršćivanje
          </p>
        </div>

        {/* Resume saved session */}
        {savedSession && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
            <Play className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Sačuvana sesija</p>
              <p className="text-xs text-muted-foreground">
                Mod: {modeLabels[savedSession.mode] || savedSession.mode}
                {savedSession.selectedCategory && ` · ${savedSession.selectedCategory}`}
              </p>
            </div>
            <Button size="sm" onClick={resumeSession} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Play className="h-3.5 w-3.5 mr-1" /> Nastavi
            </Button>
            <button onClick={() => { setSavedSession(null); clearSavedSession(); }} className="text-muted-foreground hover:text-foreground p-1">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}

        {/* Filters */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kategorija</span>
            {examFrequentCount > 0 && (
              <button
                onClick={() => setFilterExamFrequent(!filterExamFrequent)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${filterExamFrequent ? "bg-destructive/15 text-destructive border border-destructive/30" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
              >
                <Flame className="h-3 w-3" />
                Često na ispitu ({examFrequentCount})
              </button>
            )}
          </div>

          {dueCategories.length >= 1 && (
            <div className="space-y-2.5">
              <ScrollableRow>
                <motion.button
                  onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
                  className={`relative px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${!selectedCategory ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  whileTap={{ scale: 0.95 }}
                >
                  {!selectedCategory && (
                    <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />
                  )}
                  <span className="relative z-10">Sve</span>
                </motion.button>
                {dueCategories.map((c) => (
                  <motion.button
                    key={c}
                    onClick={() => { setSelectedCategory(c); setSelectedSubcategory(null); }}
                    className={`relative px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-colors ${selectedCategory === c ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    whileTap={{ scale: 0.95 }}
                  >
                    {selectedCategory === c && (
                      <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />
                    )}
                    <span className="relative z-10">{c}</span>
                    <span className={`relative z-10 text-[10px] px-1.5 py-0.5 rounded-full ${selectedCategory === c ? "bg-primary-foreground/20" : "bg-secondary"}`}>
                      {dueCards.filter(card => card.category === c).length}
                    </span>
                  </motion.button>
                ))}
              </ScrollableRow>

              <AnimatePresence>
                {selectedCategory && dueSubcategories.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
                      <motion.button
                        onClick={() => setSelectedSubcategory(null)}
                        className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${!selectedSubcategory ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                        whileTap={{ scale: 0.95 }}
                      >
                        {!selectedSubcategory && (
                          <motion.span layoutId="subcat-pill" className="absolute inset-0 rounded-md bg-primary/15" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
                        )}
                        <span className="relative z-10">Sve podkat.</span>
                      </motion.button>
                      {dueSubcategories.map((sc) => (
                        <motion.button
                          key={sc}
                          onClick={() => setSelectedSubcategory(sc)}
                          className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${selectedSubcategory === sc ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                          whileTap={{ scale: 0.95 }}
                        >
                          {selectedSubcategory === sc && (
                            <motion.span layoutId="subcat-pill" className="absolute inset-0 rounded-md bg-primary/15" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
                          )}
                          <span className="relative z-10">{sc}</span>
                        </motion.button>
                      ))}
                    </ScrollableRow>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Mode selection */}
        <div className="grid gap-4">
          {/* Mode 1: Fokusirano Utvrđivanje */}
          <button
            onClick={() => { if (stabilizationItems.length > 0) { setMode("stabilization"); clearSavedSession(); } }}
            disabled={stabilizationItems.length === 0}
            className={`rounded-xl border bg-card p-6 text-left transition-colors group ${stabilizationItems.length > 0 ? "hover:border-primary" : "opacity-50 cursor-not-allowed"}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <Target className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium">Fokusirano Utvrđivanje</h3>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Stabilizacija</span>
              </div>
              <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
                {stabilizationItems.length} {stabilizationItems.length === 1 ? "sekcija" : "sekcija"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Cilja nove eseje i one koje si skoro pogriješio. Ključno za brzo prebacivanje svježih informacija iz kratkoročne u dugoročnu memoriju.
            </p>
          </button>

          {/* Mode 2: Kritični Pregled */}
          <button
            onClick={() => { if (criticalItems.length > 0) { setMode("critical"); clearSavedSession(); } }}
            disabled={criticalItems.length === 0}
            className={`rounded-xl border bg-card p-6 text-left transition-colors group ${criticalItems.length > 0 ? "hover:border-warning" : "opacity-50 cursor-not-allowed"}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg bg-warning/10 text-warning">
                <Shield className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium">Kritični Pregled</h3>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Zadržavanje</span>
              </div>
              <span className="text-xs bg-warning/10 text-warning px-2.5 py-1 rounded-full font-medium">
                {criticalItems.length} {criticalItems.length === 1 ? "sekcija" : "sekcija"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Hvata kartice u idealnom trenutku zaborava (R ≈ 80–85%). Najbrži način da održiš sve eseje u glavi uz minimalan utrošak vremena.
            </p>
          </button>

          {/* Mode 3: Najteža Pitanja */}
          <button
            onClick={() => { if (hardestItems.length > 0) { setMode("hardest"); clearSavedSession(); } }}
            disabled={hardestItems.length === 0}
            className={`rounded-xl border bg-card p-6 text-left transition-colors group ${hardestItems.length > 0 ? "hover:border-destructive" : "opacity-50 cursor-not-allowed"}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive">
                <Zap className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium">Najteža Pitanja</h3>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Okršaj</span>
              </div>
              <span className="text-xs bg-destructive/10 text-destructive px-2.5 py-1 rounded-full font-medium">
                {hardestItems.length} {hardestItems.length === 1 ? "sekcija" : "sekcija"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Direktan okršaj sa do 50 statistički najzahtjevnijih eseja. Uključuje tvoje "Leech" kartice (padovi ≥5×) i one sa najvećim indeksom težine.
            </p>
          </button>
        </div>
      </motion.div>
    );
  }

  // Get items for current mode
  const getCurrentItems = (): DueItem[] => {
    switch (mode) {
      case "stabilization": return stabilizationItems;
      case "critical": return criticalItems;
      case "hardest": return hardestItems;
      default: return [];
    }
  };

  const items = getCurrentItems();
  const currentItem = items[randomIndex];

  const handleGrade = (grade: number) => {
    if (!currentItem) return;
    onReviewSection(currentItem.card.id, currentItem.section.id, grade);
    if (randomIndex + 1 < items.length) {
      setRandomIndex((i) => i + 1);
      setShowAnswer(false);
    } else {
      setFinished(true);
    }
  };

  if (finished || !currentItem) {
    return <FinishedScreen onBack={onBack} />;
  }

  const modeBadge = mode === "stabilization"
    ? { label: "Stabilizacija", className: "bg-primary/10 text-primary" }
    : mode === "critical"
    ? { label: "Zadržavanje", className: "bg-warning/10 text-warning" }
    : { label: "Najteže", className: "bg-destructive/10 text-destructive" };

  return (
    <ReviewCard
      card={currentItem.card}
      section={currentItem.section}
      showAnswer={showAnswer}
      setShowAnswer={setShowAnswer}
      onGrade={handleGrade}
      onLogError={onLogError}
      onBack={() => setMode(null)}
      onPause={handlePauseSession}
      progress={randomIndex}
      total={items.length}
      sectionIndex={0}
      totalSectionsInCard={1}
      srSettings={srSettings}
      viewWidth={viewWidth}
      onViewWidthChange={setViewWidth}
      modeBadge={modeBadge}
    />
  );
}

// === Shared Components ===

const REVIEW_ONBOARDING_KEY = "sr-review-onboarding-seen";

const REVIEW_SLIDES: OnboardingSlide[] = [
  {
    icon: Target,
    iconColor: "bg-primary/15 text-primary",
    title: "Fokusirano Utvrđivanje",
    content: "Cilja svježe i pogrešne kartice (Learning/Relearning, S<5d). Prebacuje ih iz kratkoročne u dugoročnu memoriju.",
  },
  {
    icon: Shield,
    iconColor: "bg-warning/15 text-warning",
    title: "Kritični Pregled",
    content: "Hvata kartice kad im je vjerovatnoća prisjećanja 80\u201385%. Idealan trenutak za minimalan utrošak vremena uz maksimalnu korist.",
  },
  {
    icon: Zap,
    iconColor: "bg-destructive/15 text-destructive",
    title: "Najteža Pitanja",
    content: "Top 50 najtežih: Leech kartice (\u22655 padova) + visoka težina (D>7). Fokusirana sesija za najtvrdokornije gradivo.",
  },
  {
    icon: BookOpen,
    iconColor: "bg-success/15 text-success",
    title: "Ocjenjivanje (1\u20134)",
    content: "1 \u2014 Potpuno nepoznato (\u223C20 min)\n2 \u2014 Poznato bez detalja (max 24h)\n3 \u2014 Sa ključnim detaljima (interval raste)\n4 \u2014 Savršeno (maksimalan rast)\n\nPrečice: Space otkriva, 1-4 ocjenjuje, N bilježi grešku.",
  },
];

function HowItWorksCorner({ onShowOnboarding }: { onShowOnboarding: () => void }) {
  return (
    <div className="absolute top-0 right-0">
      <button
        onClick={onShowOnboarding}
        className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title="Vodič kroz konsolidaciju"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
    </div>
  );
}

function FinishedScreen({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    import("@/lib/sounds").then(m => m.playSessionComplete());
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6 py-20">
      <h2 className="text-4xl font-serif italic">Sesija završena!</h2>
      <p className="text-muted-foreground text-lg">Sve dospjele sekcije su konsolidovane. Odlično!</p>
      <Button onClick={onBack} className="bg-primary hover:bg-primary/90 text-primary-foreground">
        <BookOpen className="h-4 w-4 mr-2" /> Zaključi i sačuvaj napredak
      </Button>
    </motion.div>
  );
}

function ReviewCard({
  card, section, showAnswer, setShowAnswer, onGrade, onLogError, onBack, onPause,
  progress, total, sectionIndex, totalSectionsInCard, srSettings, viewWidth, onViewWidthChange, modeBadge,
}: {
  card: Card; section: Section; showAnswer: boolean;
  setShowAnswer: (v: boolean) => void; onGrade: (g: number) => void;
  onLogError: (cardId: string, text: string) => void;
  onBack: () => void; onPause?: () => void; progress: number; total: number;
  sectionIndex: number; totalSectionsInCard: number;
  srSettings: SRSettings;
  viewWidth: ViewWidth; onViewWidthChange: (w: ViewWidth) => void;
  modeBadge?: { label: string; className: string };
}) {
  const { toast } = useToast();
  const lastGradeRef = useRef<{ cardId: string; sectionId: string; grade: number } | null>(null);
  const [answerRevealedAt, setAnswerRevealedAt] = useState<number | null>(null);
  const [canGradeEasy, setCanGradeEasy] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const questionShownAt = useRef<number>(Date.now());

  // Reset timer when card/section changes or answer is hidden
  useEffect(() => {
    if (!showAnswer) {
      setAnswerRevealedAt(null);
      setCanGradeEasy(false);
      setConfidence(null);
      questionShownAt.current = Date.now();
    }
  }, [showAnswer, card.id, section.id]);

  // 3-second timer for grade 4
  useEffect(() => {
    if (answerRevealedAt === null) return;
    const timer = setTimeout(() => setCanGradeEasy(true), 3000);
    return () => clearTimeout(timer);
  }, [answerRevealedAt]);

  const handleRevealAnswer = useCallback(() => {
    const latencyMs = Date.now() - questionShownAt.current;
    addLatencyEntry({ timestamp: Date.now(), cardId: card.id, sectionId: section.id, latencyMs, category: card.category });
    setShowAnswer(true);
    setAnswerRevealedAt(Date.now());
  }, [setShowAnswer, card.id, section.id, card.category]);

  // Wrap onGrade to also log calibration
  const handleGradeWithCalibration = useCallback((grade: number) => {
    if (confidence !== null) {
      addCalibrationEntry({ timestamp: Date.now(), cardId: card.id, sectionId: section.id, confidence, actualGrade: grade, category: card.category });
    }
    // Play sound effect
    import("@/lib/sounds").then(m => m.playGradeSound(grade));
    onGrade(grade);
  }, [confidence, card.id, section.id, card.category, onGrade]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " " && !showAnswer) {
        e.preventDefault();
        handleRevealAnswer();
        return;
      }

      if (showAnswer && ["1", "2", "3", "4"].includes(e.key)) {
        const grade = parseInt(e.key);
        if (grade === 4 && !canGradeEasy) return;
        e.preventDefault();
        lastGradeRef.current = { cardId: card.id, sectionId: section.id, grade };
        handleGradeWithCalibration(grade);
        return;
      }

      if (showAnswer && (e.key === "n" || e.key === "N")) {
        const selection = window.getSelection()?.toString().trim();
        if (!selection || selection.length < 2) return;
        onLogError(card.id, selection);
        toast({ title: "Greška zabilježena", description: `"${selection.length > 40 ? selection.slice(0, 40) + "…" : selection}"` });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAnswer, card.id, section.id, handleGradeWithCalibration, onLogError, toast, handleRevealAnswer, canGradeEasy]);

  const gradeColorMap: Record<string, string> = {
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    warning: "bg-warning text-warning-foreground hover:bg-warning/90",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    success: "bg-success text-success-foreground hover:bg-success/90",
  };

  const sectionIsLeech = isLeech(section, srSettings);
  const lapses = section.lapses || 0;
  const isFlash = card.type === "flash";
  const intervals = previewIntervals(section);

  return (
    <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          {onPause && (
            <button onClick={onPause} className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-secondary text-xs" title="Pauziraj sesiju i nastavi kasnije">
              <Pause className="h-3.5 w-3.5" /> Pauza
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {modeBadge && (
            <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${modeBadge.className}`}>
              {modeBadge.label}
            </span>
          )}
          <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
            {(Object.keys(viewWidthClasses) as ViewWidth[]).map((w) => (
              <button
                key={w}
                onClick={() => onViewWidthChange(w)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewWidth === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {viewWidthLabels[w]}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {progress + 1} / {total}
          </span>
          <ShortcutsHint shortcuts={REVIEW_SHORTCUTS} />
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(progress / total) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Leech warning */}
      {sectionIsLeech && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Problematična cjelina</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pala {lapses}× — razmislite o podjeli na manje dijelove ili drugačijem pristupu učenju.
            </p>
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={`${card.id}-${section.id}`}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Question header */}
          <div className="rounded-lg bg-secondary/50 border px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
              {card.subcategory && (
                <span className="text-xs text-muted-foreground">› {card.subcategory}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-lg leading-relaxed font-serif flex-1">{card.question}</p>
              <button onClick={() => speak(card.question)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Pročitaj naglas">
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Section info (hidden for flash cards) */}
          {!isFlash && (
            <div className="rounded-xl bg-card border p-8">
              <div className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-primary" />
                <span className="font-medium text-primary">{section.title}</span>
                {totalSectionsInCard > 1 && (
                  <span className="text-sm text-muted-foreground">
                    ({sectionIndex + 1}/{totalSectionsInCard} cjelina)
                  </span>
                )}
                {lapses > 0 && !sectionIsLeech && (
                  <span className="text-xs text-warning ml-auto">· {lapses} pad{lapses === 1 ? "" : "ova"}</span>
                )}
              </div>
              {section.stability > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Stabilnost: {section.stability.toFixed(1)}d · Težina: {section.difficulty.toFixed(0)} · Interval: {formatInterval(section.interval)}
                </p>
              )}
            </div>
          )}

          {!showAnswer ? (
            <div className="space-y-4">
              <p className="text-sm italic text-muted-foreground text-center">
                Pokušaj odgovoriti na glas prije otkrivanja.
              </p>

              {/* Confidence selector */}
              <div className="rounded-lg border bg-secondary/30 p-3 space-y-2">
                <p className="text-xs text-muted-foreground text-center">Koliko si siguran/na u odgovor?</p>
                <div className="flex justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => setConfidence(level)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                        confidence === level
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-secondary text-secondary-foreground hover:bg-accent"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                  <span>Nimalo</span>
                  <span>Potpuno</span>
                </div>
              </div>

              <Button onClick={handleRevealAnswer} className="w-full py-6 text-base" variant="outline">
                <Eye className="h-4 w-4 mr-2" /> {isFlash ? "Prikaži odgovor" : "Prikaži odgovor za ovu cjelinu"}
              </Button>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="rounded-xl bg-secondary/50 border p-8 select-text">
                <div className="flex items-center justify-between">
                  {!isFlash && (
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">{section.title}</span>
                  )}
                  <button onClick={() => speak(section.content)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors ml-auto" title="Pročitaj naglas">
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
                <div className={`${!isFlash ? "mt-4" : ""} text-base leading-relaxed whitespace-pre-wrap`} dangerouslySetInnerHTML={{ __html: section.content }} />
                <p className="mt-3 text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  Označi tekst + pritisni <kbd className="px-1 py-0.5 rounded bg-secondary border text-[9px] font-mono">N</kbd> za bilježenje greške
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-3">Ocijeni kvalitet prisjećanja:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {GRADES.map((g) => {
                    const isEasy = g.value === 4;
                    const disabled = isEasy && !canGradeEasy;
                    return (
                      <button
                        key={g.value}
                        onClick={() => !disabled && handleGradeWithCalibration(g.value)}
                        disabled={disabled}
                        className={`rounded-xl px-3 py-4 text-sm font-medium transition-all ${gradeColorMap[g.color]} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                        title={disabled ? "Pričekajte bar 3 sekunde" : undefined}
                      >
                        <span className="block text-sm font-bold">{g.label}</span>
                        <span className="block text-xs mt-1 opacity-80">{g.description}</span>
                        <span className="block text-xs mt-1.5 font-mono opacity-70">{intervals[g.value]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
