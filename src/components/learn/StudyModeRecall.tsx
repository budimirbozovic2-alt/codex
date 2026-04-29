import { Eye, Check, AlertTriangle } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { Card } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import TextSelectionTooltip from "@/components/TextSelectionTooltip";
import { HighlightedSection } from "@/lib/highlight-key-parts";
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
  strictRecall?: boolean;
}

type RecallPhase = "open" | "recall" | "reveal";
const LEECH_THRESHOLD = 4;
const AUTO_NEXT_DELAY = 600;

export default function StudyModeRecall({
  card, sortedCards, currentIndex, viewWidth, setViewWidth,
  readCards, completedCards, chainCompletedCards,
  onMarkRead, onReviewSection, onAddKeyPart,
  goToCard, goNext, goPrev, onBack,
  setCompletedCards, setTotalGrades, setModulesCompleted, updateProgress,
  strictRecall = false,
}: Props) {
  const [phase, setPhase] = useState<RecallPhase>("open");
  const [leechCount, setLeechCount] = useState(0);

  const sections = card.sections ?? [];
  const isCompleted = completedCards.has(card.id);

  // Reset state when card changes
  useEffect(() => {
    setPhase("open");
    setLeechCount(0);
  }, [card.id]);

  // Guard ref: ensure onMarkRead fires exactly once per card
  // (kept across phase transitions to prevent feedback loops with SessionContext)
  const markedRef = useRef<string | null>(null);

  const handleConfirmRead = useCallback(() => {
    if (markedRef.current !== card.id) {
      markedRef.current = card.id;
      onMarkRead(card.id);
    }
    updateProgress(card.id, { mode: "active-recall", phase: "recall", currentModule: 0, completedModules: [], chainPosition: 0, completed: false });
    setPhase("recall");
  }, [card.id, onMarkRead, updateProgress]);

  const handleReveal = useCallback(() => {
    updateProgress(card.id, { phase: "reveal" });
    setPhase("reveal");
  }, [card.id, updateProgress]);

  const handleGrade = useCallback((grade: number) => {
    // Feed FSRS — one grade per section (card-level signal)
    if (sections.length > 0) {
      sections.forEach(s => onReviewSection(card.id, s.id, grade));
    }
    setTotalGrades(prev => [...prev, grade]);

    if (grade === 4) {
      setModulesCompleted(c => c + Math.max(1, sections.length));
      setCompletedCards(prev => new Set(prev).add(card.id));
      updateProgress(card.id, { completed: true, phase: "reveal", failedAttempts: leechCount });
      setTimeout(() => goNext(), AUTO_NEXT_DELAY);
      return;
    }

    const next = leechCount + 1;
    setLeechCount(next);

    if (next >= LEECH_THRESHOLD) {
      setCompletedCards(prev => new Set(prev).add(card.id));
      updateProgress(card.id, { completed: true, leech: true, phase: "reveal", failedAttempts: next });
      setTimeout(() => goNext(), AUTO_NEXT_DELAY);
    } else {
      updateProgress(card.id, { phase: "recall", failedAttempts: next });
      setPhase("recall");
    }
  }, [card.id, sections, leechCount, onReviewSection, setTotalGrades, setModulesCompleted, setCompletedCards, updateProgress, goNext]);

  const hideQuestion = phase === "recall";

  return (
    <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
      <SessionHeader
        card={card} currentIndex={currentIndex} totalCards={sortedCards.length}
        viewWidth={viewWidth} setViewWidth={setViewWidth} onBack={onBack}
        hideQuestion={hideQuestion}
      />
      <QuestionDots cards={sortedCards} currentIndex={currentIndex}
        completedCards={completedCards} chainCompletedCards={chainCompletedCards} readCards={readCards} onSelect={goToCard} />

      {leechCount > 0 && !isCompleted && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          <span>
            Pokušaj {leechCount + 1} / {LEECH_THRESHOLD}
            {leechCount + 1 === LEECH_THRESHOLD && " — još jedna ocjena <4 i kartica se spasi"}
          </span>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={`${card.id}-${phase}-${isCompleted ? "done" : "active"}`}
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25 }} className="space-y-4">

          {!isCompleted && phase === "open" && (
            <>
              <TextSelectionTooltip cardId={card.id} question={card.question} category={card.categoryId} subcategoryId={card.subcategoryId} tags={card.tags} keyParts={card.keyParts} onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(card.id, text) : undefined}>
                <div className="space-y-3">
                  {sections.length > 0 ? (
                    sections.map(section => (
                      <div key={section.id} className="rounded-xl border bg-card p-4">
                        <p className="font-medium text-sm mb-2">{section.title}</p>
                        <HighlightedSection content={section.content} keyParts={card.keyParts} className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none card-prose" />
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground italic">
                      Nema dostupnog sadržaja odgovora.
                    </div>
                  )}
                </div>
              </TextSelectionTooltip>
              <div className="rounded-xl border bg-card p-6 space-y-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Pažljivo pročitaj pitanje i odgovor. Kada budeš spreman, potvrdi i pokušaj odgovor reprodukovati iz sjećanja.
                </p>
                <Button onClick={handleConfirmRead} className="w-full py-5">
                  <Check className="h-4 w-4 mr-2" /> Pročitao sam — počni recall
                </Button>
              </div>
            </>
          )}

          {!isCompleted && phase === "recall" && (
            <div className="rounded-xl border bg-card p-6 space-y-4 text-center">
              <p className="text-base font-medium">Ponovi odgovor na glas</p>
              <p className="text-sm text-muted-foreground">
                Pokušaj rekonstruisati odgovor iz sjećanja. Kada završiš, otkrij i ocijeni se iskreno.
              </p>
              <Button onClick={handleReveal} variant="outline" className="w-full py-5">
                <Eye className="h-4 w-4 mr-2" /> Prikaži odgovor
              </Button>
            </div>
          )}

          {!isCompleted && phase === "reveal" && (
            <>
              <TextSelectionTooltip cardId={card.id} question={card.question} category={card.categoryId} subcategoryId={card.subcategoryId} tags={card.tags} keyParts={card.keyParts} onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(card.id, text) : undefined}>
                <div className="space-y-3">
                  {sections.length > 0 ? (
                    sections.map(section => (
                      <div key={section.id} className="rounded-xl border bg-card p-4">
                        <p className="font-medium text-sm mb-2">{section.title}</p>
                        <HighlightedSection content={section.content} keyParts={card.keyParts} className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none card-prose" />
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground italic">
                      Nema dostupnog sadržaja odgovora.
                    </div>
                  )}
                </div>
              </TextSelectionTooltip>
              <div className="rounded-xl border bg-card p-4">
                <GradeButtons onGrade={handleGrade} hint="Ocijeni koliko si dobro znao odgovor (4 = napredak na sljedeću)" />
              </div>
            </>
          )}

          {isCompleted && (
            <div className={`rounded-xl border p-8 text-center space-y-3 ${
              // Leech state visual hint via progress (we cannot read it here, so always show success-styled)
              "bg-success/10 border-success/30"
            }`}>
              <Check className="h-8 w-8 text-success mx-auto" />
              <p className="text-lg font-medium">Sljedeća kartica...</p>
              <p className="text-sm text-muted-foreground">Pripremam novo pitanje.</p>
            </div>
          )}

          <NavigationButtons currentIndex={currentIndex} totalCards={sortedCards.length} onPrev={goPrev} onNext={goNext} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
