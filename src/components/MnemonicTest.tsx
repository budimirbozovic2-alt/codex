import { useState, useMemo } from "react";
import { MnemonicCard } from "@/lib/mnemonic-storage";
import { ArrowLeft, Brain, Eye, EyeOff, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  cards: MnemonicCard[];
  onRecordResult: (cardId: string, success: boolean) => void;
  onBack: () => void;
}

export default function MnemonicTest({ cards, onRecordResult, onBack }: Props) {
  const testableCards = useMemo(() => cards.filter(c => c.mnemonicStatus !== "new"), [cards]);
  const [queue, setQueue] = useState<MnemonicCard[]>(() => [...testableCards].sort(() => Math.random() - 0.5));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });
  const [finished, setFinished] = useState(false);

  const currentCard = queue[currentIndex];

  const handleResult = (success: boolean) => {
    if (!currentCard) return;
    onRecordResult(currentCard.id, success);
    setSessionStats(prev => ({
      correct: prev.correct + (success ? 1 : 0),
      wrong: prev.wrong + (success ? 0 : 1),
    }));
    setShowAnswer(false);
    if (currentIndex + 1 >= queue.length) {
      setFinished(true);
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const restart = () => {
    setQueue([...testableCards].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
    setShowAnswer(false);
    setSessionStats({ correct: 0, wrong: 0 });
    setFinished(false);
  };

  if (testableCards.length === 0) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="text-center py-16">
          <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Nema kartica spremnih za testiranje.</p>
          <p className="text-sm text-muted-foreground mt-1">Obradi kartice u Radionici prvo (status "U radionici" ili "Spremna").</p>
        </div>
      </div>
    );
  }

  if (finished) {
    const total = sessionStats.correct + sessionStats.wrong;
    const pct = total > 0 ? Math.round(sessionStats.correct / total * 100) : 0;
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12 space-y-6">
          <Brain className="h-16 w-16 mx-auto text-primary" />
          <h2 className="text-3xl font-serif">Testiranje završeno!</h2>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
            <div className="rounded-xl bg-card border p-4">
              <p className="text-2xl font-serif text-success">{sessionStats.correct}</p>
              <p className="text-xs text-muted-foreground">Tačno</p>
            </div>
            <div className="rounded-xl bg-card border p-4">
              <p className="text-2xl font-serif text-destructive">{sessionStats.wrong}</p>
              <p className="text-xs text-muted-foreground">Netačno</p>
            </div>
            <div className="rounded-xl bg-card border p-4">
              <p className={`text-2xl font-serif ${pct >= 70 ? "text-success" : pct >= 40 ? "text-warning" : "text-destructive"}`}>{pct}%</p>
              <p className="text-xs text-muted-foreground">Uspješnost</p>
            </div>
          </div>
          <Button onClick={restart} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Ponovi test
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{currentIndex + 1} / {queue.length}</span>
          <span className="text-success">{sessionStats.correct} ✓</span>
          <span className="text-destructive">{sessionStats.wrong} ✗</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex) / queue.length) * 100}%` }}
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
          {/* Question */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">{currentCard.category}{currentCard.subcategory ? ` / ${currentCard.subcategory}` : ""}</p>
            <h3 className="text-xl font-serif">{currentCard.question}</h3>
          </div>

          {/* Mnemonic hints (always visible) */}
          {(currentCard.acronym || currentCard.mnemonicVideo) && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">Tvoja mentalna kuka</p>
              {currentCard.acronym && <p className="text-sm font-medium">{currentCard.acronym}</p>}
              {currentCard.mnemonicVideo && <p className="text-sm text-muted-foreground italic">{currentCard.mnemonicVideo}</p>}
            </div>
          )}

          {/* Answer toggle */}
          {!showAnswer ? (
            <Button onClick={() => setShowAnswer(true)} variant="outline" className="w-full gap-2">
              <Eye className="h-4 w-4" /> Prikaži odgovor
            </Button>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="space-y-2">
                {currentCard.sections.map((s, i) => (
                  <div key={i} className="rounded-lg bg-secondary/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{s.title}</p>
                    <div className="text-sm prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: s.content }} />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => handleResult(false)} variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                  <XCircle className="h-4 w-4" /> Netačno
                </Button>
                <Button onClick={() => handleResult(true)} className="gap-2 bg-success text-success-foreground hover:bg-success/90">
                  <CheckCircle className="h-4 w-4" /> Tačno
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
