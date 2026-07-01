import { Eye, Check, AlertTriangle, Zap } from "lucide-react";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import { taskScheduler } from "@/lib/scheduler";

import { Card } from "@/lib/spaced-repetition";

import { m, AnimatePresence } from "@/lib/motion";

import { Button } from "@/components/ui/button";

import { CardSelectionEditor } from "@/components/card-list/CardSelectionEditor";

import { useGlobalHotkey } from "@/hooks/useGlobalHotkey";

import { shouldIgnoreGlobalKey } from "@/lib/global-overlay-state";

import SagaSatelliteSidebar from "./SagaSatelliteSidebar";

import ParentEssayScaffold from "./ParentEssayScaffold";

import SessionHeader from "./SessionHeader";

import QuestionDots from "./QuestionDots";

import GradeButtons from "./GradeButtons";

import NavigationButtons from "./NavigationButtons";

import { ViewWidth, viewWidthClasses, LearnCardProgress } from "./types";



interface Props {

  card: Card;

  allCards?: Card[];

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

  cardProgress?: LearnCardProgress;

  strictRecall?: boolean;

}



type RecallPhase = "open" | "recall" | "reveal";

const LEECH_THRESHOLD = 4;

const AUTO_NEXT_DELAY = 600;



export default function StudyModeRecall({

  card, allCards = [], sortedCards, currentIndex, viewWidth, setViewWidth,

  readCards, completedCards, chainCompletedCards,

  onMarkRead, onReviewSection, onAddKeyPart,

  goToCard, goNext, goPrev, onBack,

  setCompletedCards, setTotalGrades, setModulesCompleted, updateProgress,

  cardProgress,

  strictRecall = false,

}: Props) {

  const [phase, setPhase] = useState<RecallPhase>("open");

  const [leechCount, setLeechCount] = useState(0);

  const [sagaFlashIndex, setSagaFlashIndex] = useState(0);

  const [sagaActive, setSagaActive] = useState(false);

  const [sagaCompletedIds, setSagaCompletedIds] = useState<Set<string>>(new Set());



  const essaySatellites = useMemo(() => {

    if (card.type !== "essay") return [];

    return allCards.filter(c => c.type === "flash" && c.parentId === card.id);

  }, [allCards, card.id, card.type]);



  const parentEssay = useMemo(() => {

    if (card.type !== "flash" || !card.parentId) return null;

    return allCards.find(c => c.id === card.parentId) ?? null;

  }, [allCards, card.parentId, card.type]);



  const parentInQueue = parentEssay

    ? sortedCards.some(c => c.id === parentEssay.id)

    : false;

  const blicJuris = card.type === "flash" && !!parentEssay && !parentInQueue && !sagaActive;



  const displayCard = sagaActive

    ? (essaySatellites[sagaFlashIndex] ?? card)

    : card;



  const sections = useMemo(() => displayCard.sections ?? [], [displayCard.sections]);

  const isCompleted = completedCards.has(displayCard.id);

  const skipReadGate = strictRecall && displayCard.type === "flash";



  useEffect(() => {

    setSagaActive(false);

    setSagaFlashIndex(0);

    setSagaCompletedIds(new Set());

    setLeechCount(0);

    if (!cardProgress || cardProgress.completed) {

      setPhase(skipReadGate ? "recall" : "open");

      return;

    }

    const savedPhase = cardProgress.phase;

    setPhase(

      skipReadGate

        ? "recall"

        : savedPhase === "recall" || savedPhase === "reveal" || savedPhase === "open"

          ? savedPhase

          : "open",

    );

    setLeechCount(cardProgress.failedAttempts ?? 0);

  }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps



  const markedRef = useRef<string | null>(null);



  const handleConfirmRead = useCallback(() => {

    if (markedRef.current !== displayCard.id) {

      markedRef.current = displayCard.id;

      onMarkRead(displayCard.id);

    }

    updateProgress(displayCard.id, {

      mode: "active-recall",

      phase: "recall",

      currentModule: 0,

      completedModules: [],

      chainPosition: 0,

      completed: false,

    });

    setPhase("recall");

  }, [displayCard.id, onMarkRead, updateProgress]);



  const handleReveal = useCallback(() => {

    updateProgress(displayCard.id, { phase: "reveal" });

    setPhase("reveal");

  }, [displayCard.id, updateProgress]);



  const finishCard = useCallback((gradedCard: Card, grade: number, nextLeech: number) => {

    if (sections.length > 0) {

      sections.forEach(s => onReviewSection(gradedCard.id, s.id, grade));

    }

    setTotalGrades(prev => [...prev, grade]);



    if (grade === 4) {

      setModulesCompleted(c => c + Math.max(1, sections.length));

      setCompletedCards(prev => new Set(prev).add(gradedCard.id));

      updateProgress(gradedCard.id, { completed: true, phase: "reveal", failedAttempts: nextLeech });

      return true;

    }



    if (nextLeech >= LEECH_THRESHOLD) {

      setCompletedCards(prev => new Set(prev).add(gradedCard.id));

      updateProgress(gradedCard.id, { completed: true, leech: true, phase: "reveal", failedAttempts: nextLeech });

      return true;

    }



    updateProgress(gradedCard.id, { phase: "recall", failedAttempts: nextLeech });

    setPhase("recall");

    return false;

  }, [sections, onReviewSection, setTotalGrades, setModulesCompleted, setCompletedCards, updateProgress]);



  const handleGrade = useCallback((grade: number) => {

    if (sagaActive) {

      const sat = essaySatellites[sagaFlashIndex];

      if (!sat) return;

      const satSections = sat.sections ?? [];

      if (satSections.length > 0) {

        satSections.forEach(s => onReviewSection(sat.id, s.id, grade));

      }

      setTotalGrades(prev => [...prev, grade]);



      const done = grade === 4 || grade >= LEECH_THRESHOLD;

      if (done) {

        setSagaCompletedIds(prev => new Set(prev).add(sat.id));

        if (sagaFlashIndex + 1 < essaySatellites.length) {

          setSagaFlashIndex(i => i + 1);

          setPhase("recall");

          setLeechCount(0);

          markedRef.current = null;

          return;

        }

        setSagaActive(false);

        taskScheduler.setTimeout(() => goNext(), AUTO_NEXT_DELAY, { label: "StudyModeRecall:sagaComplete" });

        return;

      }



      const next = leechCount + 1;

      setLeechCount(next);

      setPhase("recall");

      return;

    }



    if (card.type === "essay" && essaySatellites.length > 0 && grade === 4) {

      if (sections.length > 0) {

        sections.forEach(s => onReviewSection(card.id, s.id, grade));

      }

      setTotalGrades(prev => [...prev, grade]);

      setModulesCompleted(c => c + Math.max(1, sections.length));

      setCompletedCards(prev => new Set(prev).add(card.id));

      updateProgress(card.id, { completed: true, phase: "reveal", failedAttempts: leechCount });

      setSagaActive(true);

      setSagaFlashIndex(0);

      setPhase("recall");

      setLeechCount(0);

      markedRef.current = null;

      return;

    }



    const nextLeech = grade === 4 ? leechCount : leechCount + 1;

    const finished = finishCard(displayCard, grade, nextLeech);

    if (finished) {

      taskScheduler.setTimeout(() => goNext(), AUTO_NEXT_DELAY, { label: "StudyModeRecall:autoNext" });

    } else {

      setLeechCount(nextLeech);

    }

  }, [

    sagaActive, essaySatellites, sagaFlashIndex, sections, card, displayCard,

    leechCount, onReviewSection, setTotalGrades, setModulesCompleted,

    setCompletedCards, updateProgress, finishCard, goNext,

  ]);



  useGlobalHotkey(

    () => true,

    (e) => {

      if (shouldIgnoreGlobalKey(e) || isCompleted) return;



      if (e.key === " " && phase === "recall") {

        e.preventDefault();

        handleReveal();

        return;

      }



      if (phase === "reveal" && ["1", "2", "3", "4"].includes(e.key)) {

        e.preventDefault();

        void import("@/lib/sounds").then((m) => m.playGradeSound(parseInt(e.key, 10)));

        handleGrade(parseInt(e.key, 10));

      }

    },

    [phase, isCompleted, handleReveal, handleGrade],

  );



  const hideQuestion = phase === "recall" && !blicJuris;

  const showSidebar =

    (card.type === "essay" && essaySatellites.length > 0) || sagaActive;



  return (

    <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>

      <div className={showSidebar ? "flex flex-col lg:flex-row gap-4 items-start" : undefined}>

        <div className="flex-1 min-w-0 space-y-6">

          <SessionHeader

            card={displayCard}

            currentIndex={currentIndex}

            totalCards={sortedCards.length}

            viewWidth={viewWidth}

            setViewWidth={setViewWidth}

            onBack={onBack}

            hideQuestion={hideQuestion}

          />

          <QuestionDots

            cards={sortedCards}

            currentIndex={currentIndex}

            completedCards={completedCards}

            chainCompletedCards={chainCompletedCards}

            readCards={readCards}

            onSelect={goToCard}

          />



          {blicJuris && (

            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium flex items-center gap-2">

              <Zap className="h-4 w-4 text-primary shrink-0" />

              Blic juriš

            </div>

          )}



          {sagaActive && (

            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-center">

              Saga — blic {sagaFlashIndex + 1} / {essaySatellites.length}

            </div>

          )}



          {leechCount > 0 && !isCompleted && (

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">

              <AlertTriangle className="h-3.5 w-3.5 text-warning" />

              <span>

                Pokušaj {leechCount + 1} / {LEECH_THRESHOLD}

                {leechCount + 1 === LEECH_THRESHOLD && " — još jedna ocjena <4 i kartica se spasi"}

              </span>

            </div>

          )}



          {blicJuris && parentEssay && (

            <ParentEssayScaffold essay={parentEssay} />

          )}



          <AnimatePresence mode="wait">

            <m.div

              key={`${displayCard.id}-${phase}-${isCompleted ? "done" : "active"}-${sagaActive ? "saga" : "main"}`}

              initial={{ opacity: 0, x: 40 }}

              animate={{ opacity: 1, x: 0 }}

              exit={{ opacity: 0, x: -40 }}

              transition={{ duration: 0.25 }}

              className="space-y-4"

            >

              {!isCompleted && phase === "open" && !skipReadGate && (

                <>

                  <div className="space-y-3">

                    {sections.length > 0 ? (

                      sections.map(section => (

                        <div key={section.id} className="rounded-xl border bg-card p-4">

                          <p className="font-medium text-sm mb-2">{section.title}</p>

                          <CardSelectionEditor

                            cardId={displayCard.id}

                            question={displayCard.question}

                            category={displayCard.categoryId}

                            subcategoryId={displayCard.subcategoryId}

                            tags={displayCard.tags}

                            keyParts={displayCard.keyParts}

                            categoryId={displayCard.categoryId}

                            contentDoc={section.contentDoc}

                            className="text-sm leading-relaxed prose prose-sm max-w-none card-prose"

                            onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(displayCard.id, text) : undefined}

                          />

                        </div>

                      ))

                    ) : (

                      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground italic">

                        Nema dostupnog sadržaja odgovora.

                      </div>

                    )}

                  </div>

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



              {!isCompleted && (phase === "recall" || skipReadGate) && (

                <div className="rounded-xl border bg-card p-6 space-y-4 text-center">

                  {blicJuris && (

                    <p className="text-base font-medium">{displayCard.question}</p>

                  )}

                  {!blicJuris && (

                    <p className="text-base font-medium">Ponovi odgovor na glas</p>

                  )}

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

                  <div className="space-y-3">

                    {sections.length > 0 ? (

                      sections.map(section => (

                        <div key={section.id} className="rounded-xl border bg-card p-4">

                          <p className="font-medium text-sm mb-2">{section.title}</p>

                          <CardSelectionEditor

                            cardId={displayCard.id}

                            question={displayCard.question}

                            category={displayCard.categoryId}

                            subcategoryId={displayCard.subcategoryId}

                            tags={displayCard.tags}

                            keyParts={displayCard.keyParts}

                            categoryId={displayCard.categoryId}

                            contentDoc={section.contentDoc}

                            className="text-sm leading-relaxed prose prose-sm max-w-none card-prose"

                            onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(displayCard.id, text) : undefined}

                          />

                        </div>

                      ))

                    ) : (

                      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground italic">

                        Nema dostupnog sadržaja odgovora.

                      </div>

                    )}

                  </div>

                  <div className="rounded-xl border bg-card p-4">

                    <GradeButtons onGrade={handleGrade} hint="Ocijeni koliko si dobro znao odgovor (4 = napredak na sljedeću)" />

                  </div>

                </>

              )}



              {isCompleted && (

                <div className="rounded-xl border p-8 text-center space-y-3 bg-success/10 border-success/30">

                  <Check className="h-8 w-8 text-success mx-auto" />

                  <p className="text-lg font-medium">Sljedeća kartica...</p>

                  <p className="text-sm text-muted-foreground">Pripremam novo pitanje.</p>

                </div>

              )}



              <NavigationButtons

                currentIndex={currentIndex}

                totalCards={sortedCards.length}

                onPrev={goPrev}

                onNext={goNext}

              />

            </m.div>

          </AnimatePresence>

        </div>



        {showSidebar && (

          <SagaSatelliteSidebar

            satellites={essaySatellites}

            activeIndex={sagaFlashIndex}

            completedIds={sagaCompletedIds}

            mode={sagaActive ? "active" : "minimized"}

          />

        )}

      </div>

    </div>

  );

}


