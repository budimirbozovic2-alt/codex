import React from "react";
import { Card, getCardScore } from "@/lib/spaced-repetition";
import { LearnMode } from "@/lib/storage";
import { ViewWidth, viewWidthClasses, viewWidthLabels } from "./types";



import { motion } from "framer-motion";
import { speak } from "@/lib/tts";
import ShortcutsHint from "@/components/ShortcutsHint";
import Volume2 from "lucide-react/dist/esm/icons/volume2";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Zap from "lucide-react/dist/esm/icons/zap";
const LEARN_SHORTCUTS = [
  { keys: "E", description: "Uredi karticu" },
  { keys: "←/→", description: "Prethodna / sljedeća" },
];

const AR_SHORTCUTS = [
  { keys: "Space", description: "Otkrij odgovor" },
  { keys: "1-4", description: "Ocijeni modul" },
];

const CHAIN_SHORTCUTS = [
  { keys: "Space", description: "Otkrij odgovor" },
  { keys: "1-4", description: "Ocijeni modul" },
];

interface Props {
  card: Card;
  currentIndex: number;
  totalCards: number;
  learnMode: LearnMode;
  viewWidth: ViewWidth;
  setViewWidth: (w: ViewWidth) => void;
  onBack: () => void;
}

const SessionHeader = React.memo(function SessionHeader({
  card, currentIndex, totalCards, learnMode, viewWidth, setViewWidth, onBack,
}: Props) {
  const score = getCardScore(card);
  const isFlash = card.type === "flash";

  return (
    <>
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground">
            {learnMode === "free" ? "Slobodno" : learnMode === "active-recall" ? "Aktivno" : "Lanac"}
          </span>
          <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
            {(Object.keys(viewWidthClasses) as ViewWidth[]).map((w) => (
              <button
                key={w}
                onClick={() => setViewWidth(w)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewWidth === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {viewWidthLabels[w]}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} / {totalCards}
          </span>
          <ShortcutsHint shortcuts={learnMode === "free" ? LEARN_SHORTCUTS : learnMode === "active-recall" ? AR_SHORTCUTS : CHAIN_SHORTCUTS} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Card question header */}
      <div className="rounded-xl bg-card border p-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
            {card.subcategory && <span className="text-xs text-muted-foreground">› {card.subcategory}</span>}
            {isFlash && (
              <span className="text-xs text-primary flex items-center gap-1"><Zap className="h-3 w-3" /> Blic</span>
            )}
            {(card.tags || []).includes("često-na-ispitu") && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">Često na ispitu</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="px-2 py-1 rounded-md bg-secondary">Snaga: {score}%</span>
            <span className="px-2 py-1 rounded-md bg-secondary">Pročitano: {card.readCount || 0}×</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xl leading-relaxed font-serif flex-1">{card.question}</p>
          <button onClick={() => speak(card.question)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Pročitaj naglas">
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
});

export default SessionHeader;
