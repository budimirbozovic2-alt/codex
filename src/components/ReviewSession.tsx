import { useState, useMemo, useEffect, useCallback, useRef } from "react"; 
import { Card, Section, GRADES, getDueSections, isLeech, formatInterval, previewIntervals, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye, ChevronRight, BookOpen, Shuffle, AlertTriangle, Volume2, Info, X as XIcon } from "lucide-react";
import ScrollableRow from "@/components/ScrollableRow";
import { Button } from "@/components/ui/button";
import { speak, stopSpeaking } from "@/lib/tts";
import { useToast } from "@/hooks/use-toast";
import { addCalibrationEntry, addLatencyEntry, isAnalysisNeededToday, addActivityEntry } from "@/lib/metacognitive-storage";

type ReviewMode = "essay" | "random" | null;
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
  subcategories: Record<string, string[]>;
  srSettings: SRSettings;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onLogError: (cardId: string, text: string) => void;
  onBack: () => void;
}

export default function ReviewSession({ dueCards, subcategories, srSettings, onReviewSection, onLogError, onBack }: Props) {
  const [mode, setMode] = useState<ReviewMode>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [randomIndex, setRandomIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const reviewStartRef = useRef(Date.now());
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");

  const dueCategories = useMemo(() => {
    const cats = new Set(dueCards.map((c) => c.category));
    return Array.from(cats).sort();
  }, [dueCards]);

  const filteredDueCards = useMemo(() => {
    let filtered = dueCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.category === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    return filtered;
  }, [dueCards, selectedCategory, selectedSubcategory]);

  const dueSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    const subs = new Set(dueCards.filter((c) => c.category === selectedCategory && c.subcategory).map((c) => c.subcategory!));
    return Array.from(subs).sort();
  }, [dueCards, selectedCategory]);

  const randomItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    filteredDueCards.forEach((card) => {
      getDueSections(card).forEach((section) => {
        items.push({ card, section });
      });
    });
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }, [filteredDueCards]);

  // Log activity when session finishes
  useEffect(() => {
    if (finished) {
      addActivityEntry({ timestamp: Date.now(), type: "review", durationMs: Date.now() - reviewStartRef.current });
    }
  }, [finished]);

  if (mode === null) {
    const filteredCount = filteredDueCards.length;
    const filteredSections = filteredDueCards.reduce((sum, c) => sum + getDueSections(c).length, 0);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10 relative">
        {/* Info corner */}
        <HowItWorksCorner />

        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-serif">Konsolidacija</h2>
          <p className="text-muted-foreground mt-2">
            {filteredCount} kartica · {filteredSections} {filteredSections === 1 ? "sekcija dospjela" : "sekcija dospjelo"} za učvršćivanje
          </p>
        </div>

        {dueCategories.length >= 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Filtriraj po kategoriji</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!selectedCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
              >
                Sve kategorije
              </button>
              {dueCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => { setSelectedCategory(c); setSelectedSubcategory(null); }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>

            {selectedCategory && dueSubcategories.length > 0 && (
              <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1 mt-2">
                <button
                  onClick={() => setSelectedSubcategory(null)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!selectedSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  Sve podkat.
                </button>
                {dueSubcategories.map((sc) => (
                  <button
                    key={sc}
                    onClick={() => setSelectedSubcategory(sc)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${selectedSubcategory === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                  >
                    {sc}
                  </button>
                ))}
              </ScrollableRow>
            )}
          </div>
        )}

        <div className="grid gap-4">
          <button
            onClick={() => setMode("essay")}
            className="rounded-xl border bg-card p-6 text-left hover:border-primary transition-colors group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-medium">Sekvencijalno</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Sve dospjele sekcije jedne kartice redom, pa sljedeća kartica. Idealno za temeljno učvršćivanje cijelih eseja.
            </p>
          </button>

          <button
            onClick={() => setMode("random")}
            className="rounded-xl border bg-card p-6 text-left hover:border-primary transition-colors group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Shuffle className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-medium">Interleaving (nasumično)</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Sekcije iz svih kartica izmiješane nasumično. Simulira ispitne uslove i jača dugoročno pamćenje.
            </p>
          </button>
        </div>
      </motion.div>
    );
  }

  // === ESSAY MODE ===
  if (mode === "essay") {
    const card = filteredDueCards[cardIndex];
    const dueSections = card ? getDueSections(card) : [];
    const section = dueSections[sectionIndex];

    const handleGrade = (grade: number) => {
      if (!card || !section) return;
      onReviewSection(card.id, section.id, grade);

      if (sectionIndex + 1 < dueSections.length) {
        setSectionIndex((i) => i + 1);
        setShowAnswer(false);
      } else if (cardIndex + 1 < filteredDueCards.length) {
        setCardIndex((i) => i + 1);
        setSectionIndex(0);
        setShowAnswer(false);
      } else {
        setFinished(true);
      }
    };

    if (finished || !card || !section) {
      return <FinishedScreen onBack={onBack} />;
    }

    const totalDueSections = filteredDueCards.reduce((sum, c) => sum + getDueSections(c).length, 0);
    const completedSections = filteredDueCards.slice(0, cardIndex).reduce((sum, c) => sum + getDueSections(c).length, 0) + sectionIndex;

    return (
      <ReviewCard
        card={card}
        section={section}
        showAnswer={showAnswer}
        setShowAnswer={setShowAnswer}
        onGrade={handleGrade}
        onLogError={onLogError}
        onBack={() => setMode(null)}
        progress={completedSections}
        total={totalDueSections}
        sectionIndex={sectionIndex}
        totalSectionsInCard={dueSections.length}
        srSettings={srSettings}
        viewWidth={viewWidth}
        onViewWidthChange={setViewWidth}
      />
    );
  }

  // === RANDOM MODE ===
  const currentItem = randomItems[randomIndex];

  const handleRandomGrade = (grade: number) => {
    if (!currentItem) return;
    onReviewSection(currentItem.card.id, currentItem.section.id, grade);

    if (randomIndex + 1 < randomItems.length) {
      setRandomIndex((i) => i + 1);
      setShowAnswer(false);
    } else {
      setFinished(true);
    }
  };

  if (finished || !currentItem) {
    return <FinishedScreen onBack={onBack} />;
  }

  return (
    <ReviewCard
      card={currentItem.card}
      section={currentItem.section}
      showAnswer={showAnswer}
      setShowAnswer={setShowAnswer}
      onGrade={handleRandomGrade}
      onLogError={onLogError}
      onBack={() => setMode(null)}
      progress={randomIndex}
      total={randomItems.length}
      sectionIndex={0}
      totalSectionsInCard={1}
      srSettings={srSettings}
      viewWidth={viewWidth}
      onViewWidthChange={setViewWidth}
    />
  );
}

// === Shared Components ===

function HowItWorksCorner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute top-0 right-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
      >
        <Info className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Kako funkcioniše?</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute right-0 top-8 w-80 rounded-xl border bg-card p-4 shadow-lg z-10 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Kako radi Konsolidacija?</span>
              <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground">
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                <strong className="text-foreground">FSRS v5 algoritam</strong> prati stabilnost svake sekcije kartice. Kada vjerovatnoća prisjećanja padne ispod 95%, sekcija postaje „dospjela".
              </p>
              <p>
                <strong className="text-foreground">Ocjenjivanje (1–4):</strong>
              </p>
              <ul className="space-y-1 pl-3">
                <li><span className="font-mono text-destructive">1</span> — Potpuno nepoznato → ponovi za ~20 min</li>
                <li><span className="font-mono text-warning">2</span> — Poznato bez detalja → max 24h</li>
                <li><span className="font-mono text-primary">3</span> — Sa ključnim detaljima → interval raste</li>
                <li><span className="font-mono text-success">4</span> — Savršeno (3s pauza) → maksimalan rast</li>
              </ul>
              <p>
                <strong className="text-foreground">Kalibracija:</strong> Procjena sigurnosti (1–5) prije otkrivanja mjeri iluziju znanja.
              </p>
              <p>
                <strong className="text-foreground">Prečice:</strong> <kbd className="px-1 py-0.5 rounded bg-secondary border text-[9px] font-mono">Space</kbd> otkriva, <kbd className="px-1 py-0.5 rounded bg-secondary border text-[9px] font-mono">1-4</kbd> ocjenjuje, <kbd className="px-1 py-0.5 rounded bg-secondary border text-[9px] font-mono">N</kbd> + selekcija bilježi grešku.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FinishedScreen({ onBack }: { onBack: () => void }) {
  const needsAnalysis = isAnalysisNeededToday();
  const { toast } = useToast();

  useEffect(() => {
    if (needsAnalysis) {
      toast({
        title: "📝 Dnevna samoanaliza",
        description: "Posjetite Dnevnik i zabilježite šta je bilo dobro i šta mijenjate sutra.",
        duration: 8000,
      });
    }
  }, [needsAnalysis]);

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
  card, section, showAnswer, setShowAnswer, onGrade, onLogError, onBack,
  progress, total, sectionIndex, totalSectionsInCard, srSettings, viewWidth, onViewWidthChange,
}: {
  card: Card; section: Section; showAnswer: boolean;
  setShowAnswer: (v: boolean) => void; onGrade: (g: number) => void;
  onLogError: (cardId: string, text: string) => void;
  onBack: () => void; progress: number; total: number;
  sectionIndex: number; totalSectionsInCard: number;
  srSettings: SRSettings;
  viewWidth: ViewWidth; onViewWidthChange: (w: ViewWidth) => void;
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
    // Record latency
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
    onGrade(grade);
  }, [confidence, card.id, section.id, card.category, onGrade]);

  // Keyboard shortcuts: Space to reveal, 1-4 to grade, Z to undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Space to reveal answer
      if (e.key === " " && !showAnswer) {
        e.preventDefault();
        handleRevealAnswer();
        return;
      }

      // 1-4 to grade (only when answer is shown)
      if (showAnswer && ["1", "2", "3", "4"].includes(e.key)) {
        const grade = parseInt(e.key);
        if (grade === 4 && !canGradeEasy) return;
        e.preventDefault();
        lastGradeRef.current = { cardId: card.id, sectionId: section.id, grade };
        handleGradeWithCalibration(grade);
        return;
      }

      // N-key error capture
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
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center gap-3">
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
