import { memo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Monument, MaterialTier } from "@/lib/forum-logic";
import { MATERIAL_LABELS, MATERIAL_ICONS } from "@/lib/forum-logic";
import { Progress } from "@/components/ui/progress";
import { MonumentSVG } from "./monument-buildings";
import { MonumentEffects } from "./monument-effects";

// ─── Tier ordering for upgrade detection ─────────────────
const TIER_ORDER: MaterialTier[] = ["wood", "brick", "stone", "marble", "gold"];

// ─── Particle colors per material tier ───────────────────
const PARTICLE_COLORS: Record<MaterialTier, string> = {
  wood: "hsl(30 60% 40%)",
  brick: "hsl(20 70% 45%)",
  stone: "hsl(0 0% 55%)",
  marble: "hsl(210 20% 85%)",
  gold: "hsl(45 90% 55%)",
};

const SHIMMER_COLORS: Record<MaterialTier, string> = {
  wood: "hsla(30, 60%, 40%, 0.3)",
  brick: "hsla(20, 70%, 45%, 0.3)",
  stone: "hsla(0, 0%, 55%, 0.3)",
  marble: "hsla(210, 20%, 90%, 0.4)",
  gold: "hsla(45, 90%, 55%, 0.4)",
};

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

function generateParticles(material: MaterialTier) {
  const count = 10;
  const color = PARTICLE_COLORS[material];
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 40 + Math.random() * 40;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      color,
      delay: Math.random() * 0.3,
      duration: 0.8 + Math.random() * 0.4,
    };
  });
}

interface Props {
  monument: Monument;
  index: number;
  onClick?: () => void;
}

export const MonumentCard = memo(function MonumentCard({ monument, index, onClick }: Props) {
  const style = MATERIAL_STYLES[monument.material];
  const prevMaterialRef = useRef<MaterialTier>(monument.material);
  const [upgraded, setUpgraded] = useState(false);
  const [particles, setParticles] = useState<ReturnType<typeof generateParticles>>([]);

  useEffect(() => {
    const prevIdx = TIER_ORDER.indexOf(prevMaterialRef.current);
    const currIdx = TIER_ORDER.indexOf(monument.material);

    if (currIdx > prevIdx && prevIdx >= 0) {
      setParticles(generateParticles(monument.material));
      setUpgraded(true);
      const timer = setTimeout(() => setUpgraded(false), 2000);
      prevMaterialRef.current = monument.material;
      return () => clearTimeout(timer);
    }

    prevMaterialRef.current = monument.material;
  }, [monument.material]);

  return (
    <motion.div
      layoutId={`monument-${monument.category}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      onClick={onClick}
      className={`
        glass-card relative overflow-hidden p-5 cursor-pointer
        ${style.border} ${style.glow}
        ${monument.crumbling ? "animate-pulse" : ""}
        hover:scale-[1.02] transition-transform duration-200
      `}
    >
      {/* Material background tint */}
      <div className={`absolute inset-0 ${style.bg} pointer-events-none`} aria-hidden />

      {/* Upgrade shimmer overlay */}
      <AnimatePresence>
        {upgraded && (
          <motion.div
            key="shimmer"
            className="absolute inset-0 z-20 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="absolute inset-y-0 w-1/2"
              style={{
                background: `linear-gradient(90deg, transparent, ${SHIMMER_COLORS[monument.material]}, transparent)`,
              }}
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{ duration: 1, ease: "easeInOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade particle burst */}
      <AnimatePresence>
        {upgraded && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
            {particles.map((p) => (
              <motion.div
                key={p.id}
                className="absolute rounded-full"
                style={{ width: 4, height: 4, backgroundColor: p.color }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

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

        {/* SVG Building Visualization */}
        <div className="relative flex items-center justify-center h-32" aria-hidden>
          <MonumentSVG buildingType={monument.buildingType} tier={monument.material} />
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
