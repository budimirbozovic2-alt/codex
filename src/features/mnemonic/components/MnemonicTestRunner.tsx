import { ArrowLeft, CheckCircle, Timer, XCircle, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { MnemonicCard } from "../mnemonic-storage";
import type { SessionStats } from "../hooks/useTestEngine";

interface Props {
  currentCard: MnemonicCard;
  currentIndex: number;
  queueLength: number;
  showTrigger: boolean;
  timeLeft: number;
  timedOut: boolean;
  recallLimit: number;
  sessionStats: SessionStats;
  uuidToName: Record<string, string>;
  onBack: () => void;
  onStartRecall: () => void;
  onAnswer: (success: boolean) => void;
}

export default function MnemonicTestRunner({
  currentCard, currentIndex, queueLength,
  showTrigger, timeLeft, timedOut, recallLimit, sessionStats,
  uuidToName, onBack, onStartRecall, onAnswer,
}: Props) {
  const hasTrigger = !!(currentCard.mnemonicVideo || currentCard.acronym);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{currentIndex + 1} / {queueLength}</span>
          <span className="text-success">{sessionStats.correct} ✓</span>
          <span className="text-destructive">{sessionStats.wrong} ✗</span>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(currentIndex / queueLength) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentCard.id + currentIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          className="rounded-xl border bg-card p-6 space-y-6"
        >
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {uuidToName[currentCard.categoryId] || currentCard.categoryId}
              {currentCard.subcategoryId ? ` / ${uuidToName[currentCard.subcategoryId] || currentCard.subcategoryId}` : ""}
            </p>
            <h3 className="text-xl font-medium">{currentCard.question}</h3>
          </div>

          {!showTrigger && !timedOut && (
            <Button onClick={onStartRecall} variant="outline" className="w-full gap-2">
              <Zap className="h-4 w-4" /> Prizovi mentalnu kuku ({recallLimit}s)
            </Button>
          )}

          {showTrigger && !timedOut && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground"><Timer className="h-3 w-3" /> Vrijeme za prizivanje</span>
                  <span className={`font-mono font-bold tabular-nums ${timeLeft <= 1 ? "text-destructive" : "text-primary"}`}>{timeLeft.toFixed(1)}s</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full transition-colors ${timeLeft <= 1 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${(timeLeft / recallLimit) * 100}%` }}
                  />
                </div>
              </div>

              {hasTrigger ? (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2">
                  <p className="text-xs font-medium text-primary uppercase tracking-wider">Tvoj okidač</p>
                  {currentCard.hookMode === "acronym" && currentCard.acronym && <p className="text-lg font-bold">{currentCard.acronym}</p>}
                  {currentCard.hookMode === "video" && currentCard.mnemonicVideo && <p className="text-sm italic text-muted-foreground">{currentCard.mnemonicVideo}</p>}
                  {!currentCard.hookMode && currentCard.acronym && <p className="text-lg font-bold">{currentCard.acronym}</p>}
                  {!currentCard.hookMode && currentCard.mnemonicVideo && <p className="text-sm italic text-muted-foreground">{currentCard.mnemonicVideo}</p>}
                </div>
              ) : (
                <div className="rounded-lg bg-warning/5 border border-warning/20 p-4">
                  <p className="text-sm text-warning">⚠ Nema sačuvanog okidača. Obradi ovu karticu u Radionici.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => onAnswer(false)} variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                  <XCircle className="h-4 w-4" /> Ne sjećam se
                </Button>
                <Button onClick={() => onAnswer(true)} className="gap-2 bg-success text-success-foreground hover:bg-success/90">
                  <CheckCircle className="h-4 w-4" /> Znam!
                </Button>
              </div>
            </motion.div>
          )}

          {timedOut && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-center space-y-2">
                <Timer className="h-8 w-8 mx-auto text-destructive" />
                <p className="text-sm font-medium text-destructive">Vrijeme isteklo!</p>
                <p className="text-xs text-muted-foreground">Kuka nije prizvana u {recallLimit} sekunde.</p>
              </div>
              {hasTrigger && (
                <div className="rounded-lg bg-secondary/30 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Tvoj okidač je bio:</p>
                  {currentCard.acronym && <p className="text-sm font-medium">{currentCard.acronym}</p>}
                  {currentCard.mnemonicVideo && <p className="text-sm italic text-muted-foreground">{currentCard.mnemonicVideo}</p>}
                </div>
              )}
              <Button onClick={() => onAnswer(false)} variant="outline" className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                <XCircle className="h-4 w-4" /> Dalje (netačno)
              </Button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
