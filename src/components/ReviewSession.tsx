import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, Section, GRADES, getDueSections, isLeech, formatInterval, previewIntervals, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye, ChevronRight, BookOpen, Shuffle, AlertTriangle, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { speak, stopSpeaking } from "@/lib/tts";
import { useToast } from "@/hooks/use-toast";

type ReviewMode = "essay" | "random" | null;

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

  if (mode === null) {
    const filteredCount = filteredDueCards.length;
    const filteredSections = filteredDueCards.reduce((sum, c) => sum + getDueSections(c).length, 0);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-serif">Način ponavljanja</h2>
          <p className="text-muted-foreground mt-2">{filteredCount} pitanja · {filteredSections} cjelina za ponavljanje</p>
        </div>

        {dueCategories.length >= 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Kategorija</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!selectedCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
              >
                Sve
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

            {/* Subcategory filter */}
            {selectedCategory && dueSubcategories.length > 0 && (
              <div className="flex gap-2 flex-wrap pl-3 border-l-2 border-primary/20 ml-1 mt-2">
                <button
                  onClick={() => setSelectedSubcategory(null)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${!selectedSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  Sve podkat.
                </button>
                {dueSubcategories.map((sc) => (
                  <button
                    key={sc}
                    onClick={() => setSelectedSubcategory(sc)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${selectedSubcategory === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
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
              <h3 className="text-lg font-medium">Redom po pitanjima</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Sve cjeline jednog pitanja izlaze redom. Idealno za vježbanje cijelih odgovora.
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
              <h3 className="text-lg font-medium">Nasumično</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Cjeline iz svih pitanja izlaze nasumičnim redoslijedom. Idealno za brzo ponavljanje.
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
    />
  );
}

// === Shared Components ===

function FinishedScreen({ onBack }: { onBack: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6 py-20">
      <h2 className="text-4xl font-serif italic">Bravo!</h2>
      <p className="text-muted-foreground text-lg">Završili ste sve kartice za danas.</p>
      <Button onClick={onBack} variant="outline">
        <ArrowLeft className="h-4 w-4 mr-2" /> Nazad
      </Button>
    </motion.div>
  );
}

function ReviewCard({
  card, section, showAnswer, setShowAnswer, onGrade, onLogError, onBack,
  progress, total, sectionIndex, totalSectionsInCard, srSettings,
}: {
  card: Card; section: Section; showAnswer: boolean;
  setShowAnswer: (v: boolean) => void; onGrade: (g: number) => void;
  onLogError: (cardId: string, text: string) => void;
  onBack: () => void; progress: number; total: number;
  sectionIndex: number; totalSectionsInCard: number;
  srSettings: SRSettings;
}) {
  const { toast } = useToast();

  // N-key error capture
  useEffect(() => {
    if (!showAnswer) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const selection = window.getSelection()?.toString().trim();
      if (!selection || selection.length < 2) return;
      onLogError(card.id, selection);
      toast({ title: "Greška zabilježena", description: `"${selection.length > 40 ? selection.slice(0, 40) + "…" : selection}"` });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAnswer, card.id, onLogError, toast]);
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <span className="text-sm text-muted-foreground">
          {progress + 1} / {total}
        </span>
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
            <Button onClick={() => setShowAnswer(true)} className="w-full py-6 text-base" variant="outline">
              <Eye className="h-4 w-4 mr-2" /> {isFlash ? "Prikaži odgovor" : "Prikaži odgovor za ovu cjelinu"}
            </Button>
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
                <p className="text-sm text-muted-foreground mb-3">Koliko ste znali?</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {GRADES.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => onGrade(g.value)}
                      className={`rounded-xl px-3 py-4 text-sm font-medium transition-all ${gradeColorMap[g.color]}`}
                    >
                      <span className="block text-sm font-bold">{g.label}</span>
                      <span className="block text-xs mt-1 opacity-80">{g.description}</span>
                      <span className="block text-xs mt-1.5 font-mono opacity-70">{intervals[g.value]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
