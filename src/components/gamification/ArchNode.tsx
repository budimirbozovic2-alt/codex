import { memo } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

export interface ArchNodeProps {
  name: string;
  cardCount: number;
  levels: number[];
  avgStability: number;
  index: number;
  onClick?: () => void;
}

function getMasteryColor(level: number): string {
  const colors = [
    "hsl(220, 13%, 69%)",
    "hsl(0, 72%, 51%)",
    "hsl(25, 95%, 53%)",
    "hsl(45, 93%, 47%)",
    "hsl(142, 60%, 50%)",
    "hsl(142, 60%, 30%)",
  ];
  return colors[level] ?? colors[0];
}

export const ArchNode = memo(function ArchNode({
  name,
  cardCount,
  levels,
  avgStability,
  index,
  onClick,
}: ArchNodeProps) {
  const totalMastered = levels[4] + levels[5];
  const allMastered = totalMastered === cardCount && cardCount > 0;
  const isWeak = avgStability > 0 && avgStability < 5;

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      onClick={onClick}
      className={`
        group relative overflow-hidden text-left glass-card
        ${allMastered ? "!border-gold/30" : isWeak ? "!border-destructive/20" : ""}
        hover:bg-card/60 hover:shadow-md transition-all duration-150
      `}
    >
      {/* Content */}
      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground truncate max-w-[200px] tracking-wide">
            {name}
          </h4>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
          <span className="tabular-nums">{cardCount} kartica</span>
          {avgStability > 0 && (
            <span className="tabular-nums">S̄ {avgStability.toFixed(0)}d</span>
          )}
          {isWeak && <span className="text-destructive text-[10px]">●</span>}
        </div>

        {/* Mastery bar */}
        <div className="h-1.5 w-full rounded-full overflow-hidden bg-secondary">
          <div className="flex h-full">
            {levels.map((count, lvl) =>
              count > 0 ? (
                <div
                  key={lvl}
                  style={{
                    width: `${(count / cardCount) * 100}%`,
                    backgroundColor: getMasteryColor(lvl),
                  }}
                />
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Subtle gold accent for fully mastered */}
      {allMastered && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" aria-hidden />
      )}
    </motion.button>
  );
});
