import { memo } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

interface ArchNodeProps {
  name: string;
  cardCount: number;
  levels: number[];
  avgStability: number;
  index: number;
  onClick: () => void;
}

/** Get mastery color by level index (same as KnowledgeMap) */
function getMasteryColor(level: number): string {
  const colors = [
    "hsl(220, 13%, 69%)",   // 0 Novo
    "hsl(0, 72%, 51%)",     // 1 Kritično
    "hsl(25, 95%, 53%)",    // 2 Teško
    "hsl(45, 93%, 47%)",    // 3 Nesigurno
    "hsl(142, 60%, 50%)",   // 4 Stabilno
    "hsl(142, 60%, 30%)",   // 5 Savladano
  ];
  return colors[level] ?? colors[0];
}

/** Crack SVG overlay for low stability nodes */
function CrackOverlay() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none opacity-30"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M30 0 L35 20 L28 35 L38 50 L25 70 L32 100"
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <path
        d="M70 0 L65 15 L72 30 L60 55 L68 80 L62 100"
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="0.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Column decoration SVG for sides */
function ColumnDecoration() {
  return (
    <svg
      className="absolute left-0 top-0 h-full w-3 pointer-events-none opacity-20"
      viewBox="0 0 12 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Column shaft */}
      <rect x="3" y="8" width="6" height="84" fill="hsl(var(--gold))" rx="1" />
      {/* Capital */}
      <rect x="1" y="4" width="10" height="4" fill="hsl(var(--gold))" rx="1" />
      {/* Base */}
      <rect x="1" y="92" width="10" height="4" fill="hsl(var(--gold))" rx="1" />
    </svg>
  );
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
  const hasCracks = avgStability > 0 && avgStability < 10;
  const hasIvy = avgStability > 0 && avgStability < 5;

  const borderClass = allMastered
    ? "border-gold/50 shadow-[0_0_12px_hsl(var(--gold)/0.15)]"
    : hasIvy
      ? "border-green-800/40"
      : "border-border/50";

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={onClick}
      className={`
        group relative overflow-hidden rounded-xl border p-4 text-left
        glass-card ${borderClass}
        hover:scale-[1.02] transition-transform duration-200
        ${hasIvy ? "bg-green-950/10" : ""}
      `}
    >
      {/* Column decorations */}
      <ColumnDecoration />

      {/* Crack overlay for low stability */}
      {hasCracks && <CrackOverlay />}

      {/* Content */}
      <div className="relative z-10 pl-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-sm text-foreground truncate max-w-[200px]">
            {name}
          </h4>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          {cardCount} kartica
          {avgStability > 0 && <span className="ml-2 tabular-nums">S̄ {avgStability.toFixed(0)}d</span>}
        </p>

        {/* Mastery bar */}
        <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-secondary">
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

      {/* Gold glow for fully mastered */}
      {allMastered && (
        <div className="absolute inset-0 pointer-events-none rounded-xl ring-1 ring-gold/30" aria-hidden />
      )}
    </motion.button>
  );
});
