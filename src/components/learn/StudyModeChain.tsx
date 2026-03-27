import { Eye, Check, RotateCcw, Link2 } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
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
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  goToCard: (i: number) => void;
  goNext: () => void;
  goPrev: () => void;
  onBack: () => void;
  setChainCompletedCards: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTotalGrades: React.Dispatch<React.SetStateAction<number[]>>;
  setModulesCompleted: React.Dispatch<React.SetStateAction<number>>;
  setChainResets: React.Dispatch<React.SetStateAction<number>>;
  updateProgress: (cardId: string, update: Partial<LearnCardProgress>) => void;
}

export default function StudyModeChain({
  card, sortedCards, currentIndex, viewWidth, setViewWidth,
  readCards, completedCards, chainCompletedCards,
  onReviewSection, goToCard, goNext, goPrev, onBack,
  setChainCompletedCards, setTotalGrades, setModulesCompleted, setChainResets, updateProgress,
}: Props) {
  const [chainIndex, setChainIndex] = useState(0);
  const [chainPhase, setChainPhase] = useState<"learn" | "chainReview">("learn");
  const [chainReviewIndex, setChainReviewIndex] = useState(0);
  const [chainRevealed, setChainRevealed] = useState(false);

  const sections = card.sections;
  const isChainCompleted = chainCompletedCards.has(card.id);

  // Reset on card change
  useEffect(() => {
    setChainPhase("learn");
    setChainIndex(0);
    setChainReviewIndex(0);
    setChainRevealed(false);
  }, [card.id]);

  const handleChainGrade = useCallback((grade: number) => {
    const section = sections[chainIndex];
    if (!section) return;
    onReviewSection(card.id, section.id, grade);
    setTotalGrades(prev => [...prev, grade]);
    if (grade === 4) {
      setModulesCompleted(c => c + 1);
      if (chainIndex === 0) {
        const nextIdx = chainIndex + 1;
        if (nextIdx >= sections.length) {
          setChainCompletedCards(prev => new Set(prev).add(card.id));
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
  }, [card.id, sections, chainIndex, onReviewSection, setTotalGrades, setModulesCompleted, setChainCompletedCards, updateProgress]);

  const handleChainReviewGrade = useCallback((grade: number) => {
    const section = sections[chainReviewIndex];
    if (!section) return;
    onReviewSection(card.id, section.id, grade);
    setTotalGrades(prev => [...prev, grade]);
    if (grade <= 2) {
      setChainResets(c => c + 1);
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
          setChainCompletedCards(prev => new Set(prev).add(card.id));
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
  }, [card.id, sections, chainIndex, chainReviewIndex, onReviewSection, setTotalGrades, setChainResets, setChainCompletedCards, updateProgress]);

  return (
    <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
      <SessionHeader card={card} currentIndex={currentIndex} totalCards={sortedCards.length}
        learnMode="chain" viewWidth={viewWidth} setViewWidth={setViewWidth} onBack={onBack} />
      <QuestionDots cards={sortedCards} currentIndex={currentIndex} learnMode="chain"
        completedCards={completedCards} chainCompletedCards={chainCompletedCards} readCards={readCards} onSelect={goToCard} />

      <AnimatePresence mode="wait">
        <motion.div key={`${card.id}-${chainPhase}-${chainIndex}-${chainReviewIndex}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }} className="space-y-4">
          {!isChainCompleted && (
            <>
              <div className="flex items-center gap-2">
                {sections.map((_, i) => (
                  <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${
                    i < chainIndex ? "bg-success" : i === chainIndex ? (chainPhase === "learn" ? "bg-primary" : "bg-warning") : "bg-secondary"
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
                          <div className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: highlightKeyParts(sections[chainIndex].content, card.keyParts) }} />
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
                          <div className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: highlightKeyParts(sections[chainReviewIndex].content, card.keyParts) }} />
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
