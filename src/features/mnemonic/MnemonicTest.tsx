import { ArrowLeft, Brain } from "lucide-react";
import { useMemo } from "react";
import type { MnemonicCard } from "./mnemonic-storage";
import { useCategoryData } from "@/contexts/AppContext";
import { useTestEngine } from "./hooks/useTestEngine";
import { buildUuidToName } from "./test-tree";
import MnemonicTestSelector from "./components/MnemonicTestSelector";
import MnemonicTestReminder from "./components/MnemonicTestReminder";
import MnemonicTestRunner from "./components/MnemonicTestRunner";
import MnemonicTestFinished from "./components/MnemonicTestFinished";

interface Props {
  cards: MnemonicCard[];
  onRecordResult: (cardId: string, success: boolean) => void;
  onBack: () => void;
}

export default function MnemonicTest({ cards, onRecordResult, onBack }: Props) {
  const { categoryRecords } = useCategoryData();
  const allTestable = useMemo(() => cards.filter(c => c.mnemonicStatus !== "new"), [cards]);
  const uuidToName = useMemo(() => buildUuidToName(categoryRecords), [categoryRecords]);
  const engine = useTestEngine({ onRecordResult });

  if (allTestable.length === 0) {
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

  switch (engine.phase) {
    case "selector":
      return (
        <MnemonicTestSelector
          allTestable={allTestable}
          uuidToName={uuidToName}
          onBack={onBack}
          onStart={engine.startSession}
        />
      );
    case "reminder":
      return (
        <MnemonicTestReminder
          recallLimit={engine.recallLimit}
          queueLength={engine.queue.length}
          onBack={engine.gotoSelector}
          onStart={engine.enterTestPhase}
        />
      );
    case "finished":
      return (
        <MnemonicTestFinished
          stats={engine.sessionStats}
          onBack={onBack}
          onRestart={engine.gotoSelector}
        />
      );
    case "test":
    default:
      if (!engine.currentCard) return null;
      return (
        <MnemonicTestRunner
          currentCard={engine.currentCard}
          currentIndex={engine.currentIndex}
          queueLength={engine.queue.length}
          showTrigger={engine.showTrigger}
          timeLeft={engine.timeLeft}
          timedOut={engine.timedOut}
          recallLimit={engine.recallLimit}
          sessionStats={engine.sessionStats}
          uuidToName={uuidToName}
          onBack={engine.gotoSelector}
          onStartRecall={engine.startRecall}
          onAnswer={engine.answer}
        />
      );
  }
}
