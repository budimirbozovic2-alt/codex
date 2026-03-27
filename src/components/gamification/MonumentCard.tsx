import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import type { Monument, MaterialTier } from "@/lib/forum-logic";
import { MATERIAL_LABELS, MATERIAL_ICONS } from "@/lib/forum-logic";
import { Progress } from "@/components/ui/progress";

// ─── Material color mapping (using design tokens) ───────

const MATERIAL_STYLES: Record<MaterialTier, {
  border: string;
  glow: string;
  accent: string;
  bg: string;
}> = {
  wood: {
    border: "border-amber-800/40",
    glow: "",
    accent: "text-amber-700 dark:text-amber-500",
    bg: "bg-amber-950/20",
  },
  brick: {
    border: "border-orange-700/40",
    glow: "",
    accent: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-950/20",
  },
  stone: {
    border: "border-stone-500/40",
    glow: "shadow-stone-500/10",
    accent: "text-stone-500 dark:text-stone-400",
    bg: "bg-stone-950/20",
  },
  marble: {
    border: "border-slate-300/50 dark:border-slate-400/30",
    glow: "shadow-lg shadow-slate-300/20 dark:shadow-slate-400/10",
    accent: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-100/30 dark:bg-slate-800/30",
  },
  gold: {
    border: "border-gold/50",
    glow: "shadow-lg shadow-gold/20",
    accent: "text-gold",
    bg: "bg-gold/10",
  },
};

interface Props {
  monument: Monument;
  index: number;
  onClick?: () => void;
}

export const MonumentCard = memo(function MonumentCard({ monument, index }: Props) {
  const style = MATERIAL_STYLES[monument.material];

  const pillarsCount = useMemo(() => {
    // Number of visible pillars based on mastery (2-6)
    return Math.max(2, Math.min(6, Math.floor(monument.mastery / 20) + 2));
  }, [monument.mastery]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className={`
        glass-card relative overflow-hidden p-5
        ${style.border} ${style.glow}
        ${monument.crumbling ? "animate-pulse" : ""}
        hover:scale-[1.02] transition-transform duration-200
      `}
    >
      {/* Material background tint */}
      <div className={`absolute inset-0 ${style.bg} pointer-events-none`} aria-hidden />

      {/* Content */}
      <div className="relative z-10 space-y-3">
        {/* Header: icon + category */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>{MATERIAL_ICONS[monument.material]}</span>
            <h3 className="text-sm font-semibold text-foreground truncate max-w-[160px]">
              {monument.category}
            </h3>
          </div>
          <span className={`text-[10px] font-medium tracking-wider uppercase ${style.accent} font-display`}>
            {MATERIAL_LABELS[monument.material]}
          </span>
        </div>

        {/* Pillar visualization */}
        <div className="flex items-end justify-center gap-1 h-10" aria-hidden>
          {Array.from({ length: pillarsCount }).map((_, i) => {
            const height = 16 + (monument.mastery / 100) * 24;
            const heightVariance = Math.sin(i * 1.5) * 4;
            return (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: height + heightVariance }}
                transition={{ delay: index * 0.08 + i * 0.05, duration: 0.5, ease: "easeOut" }}
                className={`w-1.5 rounded-t-sm ${
                  monument.material === "gold"
                    ? "bg-gold"
                    : monument.material === "marble"
                    ? "bg-slate-400 dark:bg-slate-500"
                    : monument.material === "stone"
                    ? "bg-stone-500 dark:bg-stone-400"
                    : monument.material === "brick"
                    ? "bg-orange-700 dark:bg-orange-500"
                    : "bg-amber-800 dark:bg-amber-600"
                }`}
              />
            );
          })}
        </div>

        {/* Mastery progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Dominatio</span>
            <span className="font-medium tabular-nums text-foreground">{monument.mastery}%</span>
          </div>
          <Progress value={monument.mastery} className="h-1.5" />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
          <span>{monument.masteredCards}/{monument.totalCards} cives</span>
          <span>S̄ {monument.avgStability}d</span>
          {monument.leechCount > 0 && (
            <span className="text-destructive">⚠ {monument.leechCount}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
});
