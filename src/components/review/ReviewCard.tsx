import { ArrowLeft, Eye, ChevronRight, AlertTriangle, Pause, Scale } from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Card, Section, GRADES, isLeech, formatInterval, previewIntervals, SRSettings } from "@/lib/spaced-repetition";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { highlightKeyParts } from "@/lib/highlight-key-parts";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { addCalibrationEntry, addLatencyEntry } from "@/lib/metacognitive-storage";
import ShortcutsHint from "@/components/ShortcutsHint";
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
  const { toast } = useToast();
  const lastGradeRef = useRef<{ cardId: string; sectionId: string; grade: number } | null>(null);
  const [answerRevealedAt, setAnswerRevealedAt] = useState<number | null>(null);
  const [canGradeEasy, setCanGradeEasy] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const questionShownAt = useRef<number>(Date.now());
  const hasSource = !!card.sourceId && !!card.originalSourceSnippet;
  const SourceSnippetDialog = useMemo(() => hasSource ? lazy(() => import("@/components/SourceSnippetDialog")) : null, [hasSource]);

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
        if (grade === 4 && !canGradeEasy) return;
        e.preventDefault();
        lastGradeRef.current = { cardId: card.id, sectionId: section.id, grade };
        handleGradeWithCalibration(grade);
        return;
      }

      if (showAnswer && (e.key === "n" || e.key === "N")) {
        const selection = window.getSelection()?.toString().trim();
        if (!selection || selection.length < 2) return;
        onLogError(card.id, selection, section.id);
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
          {/* Question header */}
          <div className="rounded-lg bg-secondary/50 border px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.categoryId}</span>
              {card.subcategory && (
                <span className="text-xs text-muted-foreground">› {card.subcategory}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-lg leading-relaxed flex-1">{card.question}</p>
              {hasSource && (
                <button
                  onClick={() => setSnippetOpen(true)}
                  className={`p-1.5 rounded-md transition-colors shrink-0 ${card.needsReview ? "text-warning hover:bg-warning/10" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                  title="Uporedi sa izvorom"
                >
                  <Scale className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Section info (hidden for flash cards) */}
          {!isFlash && (
            <div className="rounded-xl bg-card border p-5">
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
                </div>
                <div className={`${!isFlash ? "mt-4" : ""} text-base leading-relaxed whitespace-pre-wrap`} dangerouslySetInnerHTML={{ __html: highlightKeyParts(section.content, card.keyParts) }} />
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

      {hasSource && snippetOpen && SourceSnippetDialog && (
        <Suspense fallback={null}>
          <SourceSnippetDialog card={card} open={snippetOpen} onOpenChange={setSnippetOpen} />
        </Suspense>
      )}
    </div>
  );
}
