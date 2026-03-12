import { useState, useMemo } from "react";
import { Card, Section, GRADES, getDueSections } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye, ChevronRight, BookOpen, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReviewMode = "essay" | "random" | null;

interface DueItem {
  card: Card;
  section: Section;
}

interface Props {
  dueCards: Card[];
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onBack: () => void;
}

export default function ReviewSession({ dueCards, onReviewSection, onBack }: Props) {
  const [mode, setMode] = useState<ReviewMode>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [randomIndex, setRandomIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);

  // Random mode: flatten all due sections and shuffle
  const randomItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    dueCards.forEach((card) => {
      getDueSections(card).forEach((section) => {
        items.push({ card, section });
      });
    });
    // Fisher-Yates shuffle
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }, [dueCards]);

  // Mode selection screen
  if (mode === null) {
    const totalSections = dueCards.reduce((sum, c) => sum + getDueSections(c).length, 0);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-serif">Način ponavljanja</h2>
          <p className="text-muted-foreground mt-2">{dueCards.length} pitanja · {totalSections} cjelina za ponavljanje</p>
        </div>

        <div className="grid gap-4">
          <button
            onClick={() => setMode("essay")}
            className="rounded-xl border bg-card p-6 text-left hover:border-primary transition-colors group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-medium">Esejska pitanja</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Sve cjeline jednog pitanja izlaze redom. Idealno za vježbanje cijelih esejskih odgovora.
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
              <h3 className="text-lg font-medium">Kratka pitanja</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Cjeline iz svih pitanja izlaze nasumičnim redoslijedom. Idealno za brzo ponavljanje.
            </p>
          </button>
        </div>
      </motion.div>
    );
  }

  // === ESSAY MODE (original behavior) ===
  if (mode === "essay") {
    const card = dueCards[cardIndex];
    const dueSections = card ? getDueSections(card) : [];
    const section = dueSections[sectionIndex];

    const handleGrade = (grade: number) => {
      if (!card || !section) return;
      onReviewSection(card.id, section.id, grade);

      if (sectionIndex + 1 < dueSections.length) {
        setSectionIndex((i) => i + 1);
        setShowAnswer(false);
      } else if (cardIndex + 1 < dueCards.length) {
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

    const totalDueSections = dueCards.reduce((sum, c) => sum + getDueSections(c).length, 0);
    const completedSections = dueCards.slice(0, cardIndex).reduce((sum, c) => sum + getDueSections(c).length, 0) + sectionIndex;

    return (
      <ReviewCard
        card={card}
        section={section}
        showAnswer={showAnswer}
        setShowAnswer={setShowAnswer}
        onGrade={handleGrade}
        onBack={() => setMode(null)}
        progress={completedSections}
        total={totalDueSections}
        sectionIndex={sectionIndex}
        totalSectionsInCard={dueSections.length}
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
      onBack={() => setMode(null)}
      progress={randomIndex}
      total={randomItems.length}
      sectionIndex={0}
      totalSectionsInCard={1}
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
  card, section, showAnswer, setShowAnswer, onGrade, onBack,
  progress, total, sectionIndex, totalSectionsInCard,
}: {
  card: Card; section: Section; showAnswer: boolean;
  setShowAnswer: (v: boolean) => void; onGrade: (g: number) => void;
  onBack: () => void; progress: number; total: number;
  sectionIndex: number; totalSectionsInCard: number;
}) {
  const gradeColorMap: Record<string, string> = {
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    warning: "bg-warning text-warning-foreground hover:bg-warning/90",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    success: "bg-success text-success-foreground hover:bg-success/90",
  };

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

      <AnimatePresence mode="wait">
        <motion.div
          key={`${card.id}-${section.id}`}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <div className="rounded-xl bg-card border p-8">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
            <p className="mt-4 text-xl leading-relaxed font-serif">{card.question}</p>
            <div className="mt-4 flex items-center gap-2 text-sm text-primary">
              <ChevronRight className="h-4 w-4" />
              <span className="font-medium">{section.title}</span>
              {totalSectionsInCard > 1 && (
                <span className="text-muted-foreground">
                  ({sectionIndex + 1}/{totalSectionsInCard} cjelina)
                </span>
              )}
            </div>
          </div>

          {!showAnswer ? (
            <Button onClick={() => setShowAnswer(true)} className="w-full py-6 text-base" variant="outline">
              <Eye className="h-4 w-4 mr-2" /> Prikaži odgovor za ovu cjelinu
            </Button>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="rounded-xl bg-secondary/50 border p-8">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">{section.title}</span>
                <div className="mt-4 text-base leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: section.content }} />
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-3">Koliko ste znali ovu cjelinu?</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {GRADES.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => onGrade(g.value)}
                      className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${gradeColorMap[g.color]}`}
                    >
                      <span className="block">{g.label}</span>
                      <span className="block text-xs opacity-80 mt-0.5">{g.description}</span>
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
