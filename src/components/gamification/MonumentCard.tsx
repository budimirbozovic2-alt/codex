import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Monument, ConstructionPhase } from "@/lib/forum-logic";
import { PHASE_LABELS } from "@/lib/forum-logic";
import { Progress } from "@/components/ui/progress";
import { MonumentSVG } from "./monument-buildings";
import { MonumentEffects } from "./monument-effects";

// ─── Uniform phase styles — standardized borders ────
const PHASE_STYLES: Record<ConstructionPhase, {
  border: string;
  accent: string;
}> = {
  foundation: {
    border: "border-gold/20",
    accent: "text-gold/50",
  },
  skeleton: {
    border: "border-gold/20",
    accent: "text-gold/60",
  },
  construction: {
    border: "border-gold/20",
    accent: "text-gold/70",
  },
  complete: {
    border: "border-gold/20",
    accent: "text-gold/85",
  },
  imperial: {
    border: "border-gold/20",
    accent: "text-gold",
  },
};

interface Props {
  monument: Monument;
  index: number;
  onClick?: () => void;
}

export const MonumentCard = memo(function MonumentCard({ monument, index, onClick }: Props) {
  const style = PHASE_STYLES[monument.material];

  return (
    <motion.div
      layoutId={`monument-${monument.category}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      onClick={onClick}
      className={`
        glass-card relative overflow-hidden p-5 cursor-pointer
        ${style.border}
        ${monument.crumbling ? "opacity-75" : ""}
        hover:scale-[1.02] transition-transform duration-150
      `}
    >
      {/* Content */}
      <div className="relative z-10 space-y-3">
        {/* Header: category */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground truncate max-w-[160px]">
            {monument.category}
          </h3>
          <span className={`text-[10px] font-medium tracking-wider uppercase ${style.accent}`}>
            {PHASE_LABELS[monument.material]}
          </span>
        </div>

        {/* SVG Building Visualization — fast crossfade */}
        <div className="relative flex items-center justify-center h-32 overflow-hidden" aria-hidden>
          <AnimatePresence mode="wait">
            <motion.div
              key={monument.material}
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <MonumentSVG buildingType={monument.buildingType} tier={monument.material} />
            </motion.div>
          </AnimatePresence>
          <MonumentEffects monument={monument} />
        </div>

        {/* Mastery progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Savladanost</span>
            <span className="font-medium tabular-nums text-foreground">{monument.mastery}%</span>
          </div>
          <Progress value={monument.mastery} className="h-1.5" />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
          <span>{monument.masteredCards}/{monument.totalCards} modula</span>
          <span>S̄ {monument.avgStability}d</span>
          {monument.leechCount > 0 && (
            <span className="text-destructive">⚠ {monument.leechCount}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
});
