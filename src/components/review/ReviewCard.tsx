import { ArrowLeft, Eye, ChevronRight, AlertTriangle, Pause, Scale } from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Card, Section, isLeech, formatInterval, getCachedRetention, SRSettings } from "@/lib/spaced-repetition";
import AdaptiveReasonPanel from "./AdaptiveReasonPanel";
import { useCategoryData } from "@/contexts/AppContext";
import { HighlightedSection } from "@/lib/highlight-key-parts";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { addCalibrationEntry, addLatencyEntry } from "@/lib/metacognitive-storage";
import ShortcutsHint from "@/components/ShortcutsHint";
import GradeButtons from "@/components/learn/GradeButtons";
import { ViewWidth, viewWidthClasses, viewWidthLabels, REVIEW_SHORTCUTS } from "./review-constants";
interface ReviewCardProps {
  card: Card;
  section: Section;
  showAnswer: boolean;
  setShowAnswer: (v: boolean) => void;
  onGrade: (g: number) => void;
  onLogError: (cardId: string, text: string, sectionId?: string) => void;
  onBack: () => void;
  onPause?: () => void;
  progress: number;
  total: number;
  sectionIndex: number;
  totalSectionsInCard: number;
  srSettings: SRSettings;
  viewWidth: ViewWidth;
  onViewWidthChange: (w: ViewWidth) => void;
  modeBadge?: { label: string; className: string };
}

export default function ReviewCard({
  card, section, showAnswer, setShowAnswer, onGrade, onLogError, onBack, onPause,
  progress, total, sectionIndex, totalSectionsInCard, srSettings, viewWidth, onViewWidthChange, modeBadge,
}: ReviewCardProps) {
  
  const { categoryRecords } = useCategoryData();
  const catRecord = categoryRecords.find(r => r.id === card.categoryId);
  const catName = catRecord?.name ?? card.categoryId;
  const subName = catRecord?.subcategories?.find(s => s.id === card.subcategoryId)?.name ?? card.subcategoryId;
  const lastGradeRef = useRef<{ cardId: string; sectionId: string; grade: number } | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const questionShownAt = useRef<number>(Date.now());
  const hasSource = !!card.sourceId && !!card.originalSourceSnippet;
  const SourceSnippetDialog = useMemo(() => hasSource ? lazy(() => import("@/components/SourceSnippetDialog")) : null, [hasSource]);

  // Reset per-card UI state when card/section changes or answer is hidden
  useEffect(() => {
    if (!showAnswer) {
      setConfidence(null);
      questionShownAt.current = Date.now();
    }
  }, [showAnswer, card.id, section.id]);


  const handleRevealAnswer = useCallback(() => {
    const latencyMs = Date.now() - questionShownAt.current;
    addLatencyEntry({ timestamp: Date.now(), cardId: card.id, sectionId: section.id, latencyMs, category: card.categoryId });
    setShowAnswer(true);
    setAnswerRevealedAt(Date.now());
  }, [setShowAnswer, card.id, section.id, card.categoryId]);

  const handleGradeWithCalibration = useCallback((grade: number) => {
    if (confidence !== null) {
      addCalibrationEntry({ timestamp: Date.now(), cardId: card.id, sectionId: section.id, confidence, actualGrade: grade, category: card.categoryId });
    }
    import("@/lib/sounds").then(m => m.playGradeSound(grade));
    onGrade(grade);
  }, [confidence, card.id, section.id, card.categoryId, onGrade]);

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
        // Cooldown removed for parity with Active Recall.
        e.preventDefault();
        lastGradeRef.current = { cardId: card.id, sectionId: section.id, grade };
        handleGradeWithCalibration(grade);
        return;
      }

      if (showAnswer && (e.key === "n" || e.key === "N")) {
        const selection = window.getSelection()?.toString().trim();
        if (!selection || selection.length < 2) return;
        onLogError(card.id, selection, section.id);
        toast("Greška zabilježena", { description: `"${selection.length > 40 ? selection.slice(0, 40) + "…" : selection}"` });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAnswer, card.id, section.id, handleGradeWithCalibration, onLogError, handleRevealAnswer]);

  const sectionIsLeech = isLeech(section, srSettings);
  const lapses = section.lapses || 0;
  const isFlash = card.type === "flash";

  return (
    <div className={`${viewWidthClasses[viewWidth]} mx-auto space-y-6 transition-all duration-300`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1" aria-label="Nazad na listu">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          {onPause && (
            <button onClick={onPause} className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-secondary text-xs" title="Pauziraj sesiju i nastavi kasnije" aria-label="Pauziraj sesiju">
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
          {/* Card question header — aligned with Active Recall */}
          <div className="rounded-xl bg-card border p-8">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">{catName}</span>
                {card.subcategoryId && (
                  <span className="text-xs text-muted-foreground">› {subName}</span>
                )}
                {!isFlash && (
                  <span className="text-xs text-primary flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" /> {section.title}
                    {totalSectionsInCard > 1 && (
                      <span className="text-muted-foreground">({sectionIndex + 1}/{totalSectionsInCard})</span>
                    )}
                  </span>
                )}
              </div>
              {hasSource && (
                <button
                  onClick={() => setSnippetOpen(true)}
                  className={`p-1.5 rounded-md transition-colors shrink-0 ${card.needsReview ? "text-warning hover:bg-warning/10" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                  title="Uporedi sa izvorom"
                  aria-label="Uporedi sa izvorom"
                >
                  <Scale className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xl leading-relaxed">{card.question}</p>
            {!isFlash && section.stability > 0 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                <span className="px-2 py-0.5 rounded-md bg-secondary">Stabilnost: {section.stability.toFixed(1)}d</span>
                <span className="px-2 py-0.5 rounded-md bg-secondary">Težina: {section.difficulty.toFixed(0)}</span>
                <span className="px-2 py-0.5 rounded-md bg-secondary">Interval: {formatInterval(section.interval)}</span>
                {lapses > 0 && !sectionIsLeech && (
                  <span className="px-2 py-0.5 rounded-md bg-warning/10 text-warning">{lapses} pad{lapses === 1 ? "" : "ova"}</span>
                )}
              </div>
            )}
          </div>

          <AdaptiveReasonPanel
            ctx={{
              frequencyTag: card.frequencyTag,
              sourceType: card.sourceType,
              examinerProfile: catRecord?.examinerProfile,
            }}
            baseRetention={getCachedRetention()}
          />

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
                </div>
                <HighlightedSection content={section.content} keyParts={card.keyParts} className={`${!isFlash ? "mt-4" : ""} text-base leading-relaxed whitespace-pre-wrap`} />
                <p className="mt-3 text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  Označi tekst + pritisni <kbd className="px-1 py-0.5 rounded bg-secondary border text-[9px] font-mono">N</kbd> za bilježenje greške
                </p>
              </div>

              <GradeButtons
                onGrade={handleGradeWithCalibration}
                hint="Ocijeni kvalitet prisjećanja (4 = bez oklijevanja)"
              />

            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {hasSource && snippetOpen && SourceSnippetDialog && (
        <Suspense fallback={null}>
          <SourceSnippetDialog card={card} open={snippetOpen} onOpenChange={setSnippetOpen} />
        </Suspense>
      )}
    </div>
  );
}
