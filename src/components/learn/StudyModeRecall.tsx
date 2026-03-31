import { Eye, Check } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import TextSelectionTooltip from "@/components/TextSelectionTooltip";
import { highlightKeyParts } from "@/lib/highlight-key-parts";
import SessionHeader from "./SessionHeader";
import QuestionDots from "./QuestionDots";
import GradeButtons from "./GradeButtons";
import NavigationButtons from "./NavigationButtons";
import { ViewWidth, viewWidthClasses, LearnCardProgress } from "./types";
interface Props {
  card: Card;
  sortedCards: Card[];
  currentIndex: number;
  viewWidth: ViewWidth;
  setViewWidth: (w: ViewWidth) => void;
  readCards: Set<string>;
  completedCards: Set<string>;
  chainCompletedCards: Set<string>;
  onMarkRead: (id: string) => void;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onAddKeyPart?: (cardId: string, text: string) => void;
  goToCard: (i: number) => void;
  goNext: () => void;
  goPrev: () => void;
  onBack: () => void;
  setCompletedCards: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTotalGrades: React.Dispatch<React.SetStateAction<number[]>>;
  setModulesCompleted: React.Dispatch<React.SetStateAction<number>>;
  updateProgress: (cardId: string, update: Partial<LearnCardProgress>) => void;
}

export default function StudyModeRecall({
  card, sortedCards, currentIndex, viewWidth, setViewWidth,
  readCards, completedCards, chainCompletedCards,
  onMarkRead, onReviewSection, onAddKeyPart,
  goToCard, goNext, goPrev, onBack,
  setCompletedCards, setTotalGrades, setModulesCompleted, updateProgress,
}: Props) {
  const [arPhase, setArPhase] = useState<"preview" | "drill">("preview");
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillRevealed, setDrillRevealed] = useState(false);

  const sections = card.sections;
  const isCompleted = completedCards.has(card.id);

  // Reset state when card changes
  useEffect(() => {
    setArPhase("preview");
    setDrillIndex(0);
    setDrillRevealed(false);
  }, [card.id]);

  const handleArGrade = useCallback((grade: number) => {
    const section = sections[drillIndex];
    if (!section) return;
    onReviewSection(card.id, section.id, grade);
    setTotalGrades(prev => [...prev, grade]);
    if (grade === 4) {
      setModulesCompleted(c => c + 1);
      const nextIdx = drillIndex + 1;
      if (nextIdx >= sections.length) {
        setCompletedCards(prev => new Set(prev).add(card.id));
        updateProgress(card.id, { completed: true, currentModule: 0, phase: "drill" });
      } else {
        setDrillIndex(nextIdx);
        setDrillRevealed(false);
        updateProgress(card.id, { currentModule: nextIdx, phase: "drill" });
      }
    } else {
      setDrillRevealed(false);
    }
  }, [card.id, sections, drillIndex, onReviewSection, setTotalGrades, setModulesCompleted, setCompletedCards, updateProgress]);

  const startDrill = useCallback(() => {
    setArPhase("drill");
    setDrillIndex(0);
    setDrillRevealed(false);
    onMarkRead(card.id);
    updateProgress(card.id, { mode: "active-recall", phase: "drill", currentModule: 0, completedModules: [], chainPosition: 0, completed: false });
  }, [card.id, onMarkRead, updateProgress]);

  return (
    <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
      <SessionHeader card={card} currentIndex={currentIndex} totalCards={sortedCards.length}
        learnMode="active-recall" viewWidth={viewWidth} setViewWidth={setViewWidth} onBack={onBack} />
      <QuestionDots cards={sortedCards} currentIndex={currentIndex} learnMode="active-recall"
        completedCards={completedCards} chainCompletedCards={chainCompletedCards} readCards={readCards} onSelect={goToCard} />

      <AnimatePresence mode="wait">
        <motion.div key={`${card.id}-${arPhase}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }} className="space-y-4">
          {arPhase === "preview" && !isCompleted && (
            <>
              <TextSelectionTooltip cardId={card.id} question={card.question} category={card.categoryId} subcategoryId={card.subcategoryId || card.subcategory} tags={card.tags} keyParts={card.keyParts} onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(card.id, text) : undefined}>
                <div className="space-y-3">
                  <span className="text-sm text-muted-foreground">{sections.length} modula — pročitaj pažljivo</span>
                  {sections.map(section => (
                    <div key={section.id} className="rounded-xl border bg-card p-4">
                      <p className="font-medium text-sm mb-2">{section.title}</p>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: highlightKeyParts(section.content, card.keyParts) }} />
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
                  <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${i < drillIndex ? "bg-success" : i === drillIndex ? "bg-primary" : "bg-secondary"}`} />
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
                      <div className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: highlightKeyParts(sections[drillIndex].content, card.keyParts) }} />
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
              <p className="text-lg font-medium">Pitanje savladano!</p>
              <p className="text-sm text-muted-foreground">Svi moduli su uspješno reprodukovani.</p>
            </div>
          )}

          <NavigationButtons currentIndex={currentIndex} totalCards={sortedCards.length} onPrev={goPrev} onNext={goNext} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
