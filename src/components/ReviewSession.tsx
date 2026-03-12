import { useState } from "react";
import { Card, Section, GRADES, getDueSections } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Eye, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  dueCards: Card[];
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onBack: () => void;
}

export default function ReviewSession({ dueCards, onReviewSection, onBack }: Props) {
  const [cardIndex, setCardIndex] = useState(0);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);

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

  const gradeColorMap: Record<string, string> = {
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    warning: "bg-warning text-warning-foreground hover:bg-warning/90",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    success: "bg-success text-success-foreground hover:bg-success/90",
  };

  const totalDueSections = dueCards.reduce((sum, c) => sum + getDueSections(c).length, 0);
  const completedSections = dueCards.slice(0, cardIndex).reduce((sum, c) => sum + getDueSections(c).length, 0) + sectionIndex;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <span className="text-sm text-muted-foreground">
          Cjelina {completedSections + 1} / {totalDueSections}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${((completedSections) / totalDueSections) * 100}%` }}
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
          {/* Question */}
          <div className="rounded-xl bg-card border p-8">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
            <p className="mt-4 text-xl leading-relaxed font-serif">{card.question}</p>
            <div className="mt-4 flex items-center gap-2 text-sm text-primary">
              <ChevronRight className="h-4 w-4" />
              <span className="font-medium">{section.title}</span>
              <span className="text-muted-foreground">
                ({sectionIndex + 1}/{dueSections.length} cjelina)
              </span>
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
                <p className="mt-4 text-base leading-relaxed whitespace-pre-wrap">{section.content}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-3">Koliko ste znali ovu cjelinu?</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {GRADES.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => handleGrade(g.value)}
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
