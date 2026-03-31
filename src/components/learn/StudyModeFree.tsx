import { ChevronRight, Eye, Pencil, Scale, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { Card } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import TextSelectionTooltip from "@/components/TextSelectionTooltip";
import { highlightKeyParts } from "@/lib/highlight-key-parts";
import SessionHeader from "./SessionHeader";
import QuestionDots from "./QuestionDots";
import { ViewWidth, viewWidthClasses } from "./types";
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
  onEdit?: (card: Card) => void;
  onAddKeyPart?: (cardId: string, text: string) => void;
  goToCard: (i: number) => void;
  goNext: () => void;
  goPrev: () => void;
  onBack: () => void;
}

export default function StudyModeFree({
  card, sortedCards, currentIndex, viewWidth, setViewWidth,
  readCards, completedCards, chainCompletedCards,
  onMarkRead, onEdit, onAddKeyPart, goToCard, goNext, goPrev, onBack,
}: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [snippetOpen, setSnippetOpen] = useState(false);
  const SourceSnippetDialog = useMemo(() => lazy(() => import("@/components/SourceSnippetDialog")), []);

  // Reset expanded sections when card changes
  useEffect(() => { setExpandedSections(new Set()); }, [card.id]);

  const isRead = readCards.has(card.id);
  const isFlash = card.type === "flash";

  const toggleSection = useCallback((i: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }, []);

  const showAll = useCallback(() => setExpandedSections(new Set(card.sections.map((_, i) => i))), [card.sections]);

  const handleMarkRead = useCallback(() => {
    onMarkRead(card.id);
  }, [onMarkRead, card.id]);

  // Keyboard: E to edit
  useEffect(() => {
    if (!onEdit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
        onEdit(card);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [card, onEdit]);

  return (
    <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
      <SessionHeader card={card} currentIndex={currentIndex} totalCards={sortedCards.length}
        learnMode="free" viewWidth={viewWidth} setViewWidth={setViewWidth} onBack={onBack} />
      <QuestionDots cards={sortedCards} currentIndex={currentIndex} learnMode="free"
        completedCards={completedCards} chainCompletedCards={chainCompletedCards} readCards={readCards} onSelect={goToCard} />

      <AnimatePresence mode="wait">
        <motion.div key={card.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }} className="space-y-4">
          {isFlash ? (
            <TextSelectionTooltip cardId={card.id} question={card.question} category={card.categoryId} subcategory={card.subcategory} tags={card.tags} keyParts={card.keyParts} onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(card.id, text) : undefined}>
              <div className="rounded-xl border bg-card overflow-hidden">
                <button onClick={() => toggleSection(0)} className="w-full flex items-center gap-2 p-4 text-left hover:bg-secondary/30 transition-colors">
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSections.has(0) ? "rotate-90" : ""}`} />
                  <span className="font-medium text-sm">Odgovor</span>
                </button>
                {expandedSections.has(0) && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="px-4 pb-4 border-t">
                    <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: highlightKeyParts(card.sections[0]?.content || "", card.keyParts) }} />
                  </motion.div>
                )}
              </div>
            </TextSelectionTooltip>
          ) : (
            <TextSelectionTooltip cardId={card.id} question={card.question} category={card.categoryId} subcategory={card.subcategory} tags={card.tags} keyParts={card.keyParts} onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(card.id, text) : undefined}>
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
                        <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: highlightKeyParts(section.content, card.keyParts) }} />
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>
            </TextSelectionTooltip>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-2" /> Prethodna
            </Button>
            {onEdit && (
              <Button variant="ghost" size="icon" onClick={() => onEdit(card)} title="Uredi karticu (E)" className="shrink-0">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {card.sourceId && card.originalSourceSnippet && (
              <Button variant="ghost" size="icon" onClick={() => setSnippetOpen(true)} title="Uporedi sa izvorom" className={`shrink-0 ${card.needsReview ? "text-warning" : ""}`}>
                <Scale className="h-4 w-4" />
              </Button>
            )}
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

      {card.sourceId && card.originalSourceSnippet && snippetOpen && (
        <Suspense fallback={null}>
          <SourceSnippetDialog card={card} open={snippetOpen} onOpenChange={setSnippetOpen} />
        </Suspense>
      )}
    </div>
  );
}
