/**
 * Blueprint Line-Art SVG Primitive Library
 * High-end architectural vector illustrations.
 * Gold lines on dark background, frosted glass surfaces.
 * viewBox: 0 0 200 160
 */
import type { ConstructionPhase } from "@/lib/forum-logic";

// ─── Phase Color Palette ─────────────────────────────────

export const PHASE_PALETTE: Record<ConstructionPhase, {
  stroke: string; strokeW: number; fill: string; accent: string; opacity: number;
  dasharray?: string;
}> = {
  foundation: {
    stroke: "hsl(45,60%,40%)", strokeW: 0.4, fill: "rgba(255,255,255,0.03)",
    accent: "hsl(45,50%,35%)", opacity: 0.35, dasharray: "3,3",
  },
  skeleton: {
    stroke: "hsl(45,65%,45%)", strokeW: 0.5, fill: "rgba(255,255,255,0.04)",
    accent: "hsl(45,55%,38%)", opacity: 0.55, dasharray: "5,2",
  },
  construction: {
    stroke: "hsl(45,70%,50%)", strokeW: 0.6, fill: "rgba(255,255,255,0.06)",
    accent: "hsl(45,60%,42%)", opacity: 0.75,
  },
  complete: {
    stroke: "hsl(45,75%,55%)", strokeW: 0.7, fill: "rgba(255,255,255,0.08)",
    accent: "hsl(45,65%,48%)", opacity: 0.9,
  },
  imperial: {
    stroke: "hsl(45,90%,55%)", strokeW: 0.8, fill: "rgba(255,255,255,0.1)",
    accent: "hsl(45,85%,50%)", opacity: 1.0,
  },
};

// Backward-compat export
export const TIER_FILLS = PHASE_PALETTE;

// ─── Gradient Definitions ────────────────────────────────

export function PhaseGradientDefs({ phase, prefix = "" }: { phase: ConstructionPhase; prefix?: string }) {
  const p = PHASE_PALETTE[phase];
  const glowOpacity = phase === "imperial" ? 0.15 : 0;
  return (
    <defs>
      {/* Frosted glass fill */}
      <linearGradient id={`${prefix}glass`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="white" stopOpacity={0.08} />
        <stop offset="100%" stopColor="white" stopOpacity={0.03} />
      </linearGradient>
      {/* Base shadow */}
      <radialGradient id={`${prefix}base-shadow`} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
        <stop offset="0%" stopColor={p.stroke} stopOpacity={0.1} />
        <stop offset="100%" stopColor={p.stroke} stopOpacity={0} />
      </radialGradient>
      {/* Arch inner shadow */}
      <radialGradient id={`${prefix}arch-shadow`}>
        <stop offset="0%" stopColor="hsl(0,0%,5%)" stopOpacity={0.2} />
        <stop offset="100%" stopColor="hsl(0,0%,5%)" stopOpacity={0} />
      </radialGradient>
      {/* Imperial glow */}
      {glowOpacity > 0 && (
        <radialGradient id={`${prefix}imperial-glow`} cx="0.5" cy="0.6" rx="0.5" ry="0.5">
          <stop offset="0%" stopColor="hsl(45,90%,55%)" stopOpacity={glowOpacity} />
          <stop offset="70%" stopColor="hsl(45,90%,55%)" stopOpacity={0.03} />
          <stop offset="100%" stopColor="hsl(45,90%,55%)" stopOpacity={0} />
        </radialGradient>
      )}
      {/* Glow filter for imperial */}
      {phase === "imperial" && (
        <filter id={`${prefix}gold-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      )}
    </defs>
  );
}

// Backward-compat alias
export const TierGradientDefs = ({ tier, prefix = "" }: { tier: ConstructionPhase; prefix?: string }) => (
  <PhaseGradientDefs phase={tier} prefix={prefix} />
);

interface PrimitiveProps {
  tier: ConstructionPhase;
  x?: number;
  y?: number;
  prefix?: string;
}

// ─── Column ──────────────────────────────────────────────

export function Column({ tier, x = 0, y = 0, prefix = "" }: PrimitiveProps) {
  const p = PHASE_PALETTE[tier];
  const h = 58;
  const bw = 5;
  const tw = 4;
  const mw = bw + 0.8;

  const isEarly = tier === "foundation" || tier === "skeleton";
  const shaft = `M${-bw},0 C${-bw},${-h * 0.3} ${-mw},${-h * 0.5} ${-tw},${-h} L${tw},${-h} C${mw},${-h * 0.5} ${bw},${-h * 0.3} ${bw},0 Z`;

  // Foundation: only base marker
  if (tier === "foundation") {
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-bw - 1} y={0} width={(bw + 1) * 2} height={3} fill="none"
          stroke={p.stroke} strokeWidth={p.strokeW} strokeDasharray={p.dasharray} opacity={p.opacity} />
        <line x1={0} y1={0} x2={0} y2={-h * 0.3} stroke={p.stroke} strokeWidth={0.3}
          strokeDasharray="2,4" opacity={0.25} />
      </g>
    );
  }

  // Skeleton: wireframe column
  if (tier === "skeleton") {
    return (
      <g transform={`translate(${x},${y})`}>
        <path d={shaft} fill="none" stroke={p.stroke} strokeWidth={p.strokeW}
          strokeDasharray={p.dasharray} opacity={p.opacity} />
        <rect x={-bw - 1} y={0} width={(bw + 1) * 2} height={3} fill="none"
          stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} />
      </g>
    );
  }

  // Construction+: progressively more filled
  const fillOpacity = tier === "construction" ? 0.4 : 1;
  const flutingCount = tier === "imperial" ? 5 : tier === "complete" ? 4 : 3;

  return (
    <g transform={`translate(${x},${y})`}
      filter={tier === "imperial" ? `url(#${prefix}gold-glow)` : undefined}>
      {/* Shaft */}
      <path d={shaft} fill={`url(#${prefix}glass)`} fillOpacity={fillOpacity}
        stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} />

      {/* Fluting */}
      {flutingCount > 0 && Array.from({ length: flutingCount }).map((_, i) => {
        const fx = -bw + 1.5 + (i * (bw * 2 - 3)) / (flutingCount - 1);
        return (
          <line key={i} x1={fx * 0.95} y1={-2} x2={fx * (tw / bw) * 0.95} y2={-h + 3}
            stroke={p.accent} strokeWidth={0.2} opacity={0.3} />
        );
      })}

      {/* Capital */}
      {tier === "construction" && (
        <rect x={-tw - 1} y={-h - 2} width={(tw + 1) * 2} height={2.5}
          fill="none" stroke={p.stroke} strokeWidth={p.strokeW} opacity={0.6} />
      )}
      {tier === "complete" && (
        <g>
          <rect x={-tw - 3.5} y={-h - 4} width={(tw + 3.5) * 2} height={4}
            fill={`url(#${prefix}glass)`} stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} rx={0.8} />
          <circle cx={-tw - 2.5} cy={-h - 2} r={2} fill="none" stroke={p.stroke} strokeWidth={0.3} opacity={0.5} />
          <circle cx={tw + 2.5} cy={-h - 2} r={2} fill="none" stroke={p.stroke} strokeWidth={0.3} opacity={0.5} />
        </g>
      )}
      {tier === "imperial" && (
        <g>
          <rect x={-tw - 4} y={-h - 7} width={(tw + 4) * 2} height={7}
            fill={`url(#${prefix}glass)`} stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} rx={0.8} />
          <path d={`M${-tw - 1},${-h} Q${-tw + 1},${-h - 4} 0,${-h - 5} Q${tw - 1},${-h - 4} ${tw + 1},${-h}`}
            fill="none" stroke={p.accent} strokeWidth={0.5} opacity={0.6} />
          <path d={`M${-tw},${-h - 1} Q${-tw + 2},${-h - 6} 0,${-h - 6.5} Q${tw - 2},${-h - 6} ${tw},${-h - 1}`}
            fill="none" stroke={p.accent} strokeWidth={0.35} opacity={0.5} />
        </g>
      )}

      {/* Base plinth */}
      <rect x={-bw - 1} y={0} width={(bw + 1) * 2} height={3}
        fill={isEarly ? "none" : `url(#${prefix}glass)`}
        stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} rx={0.5} />
    </g>
  );
}

// ─── Triangular Roof (Pediment) ──────────────────────────

export function TriangularRoof({ tier, x = 0, y = 0, width = 80, prefix = "" }: PrimitiveProps & { width?: number }) {
  const p = PHASE_PALETTE[tier];
  const hw = width / 2;
  const oh = 4;
  const peakH = tier === "imperial" ? 22 : tier === "complete" ? 20 : 17;

  // Foundation/Skeleton: blueprint outline only
  if (tier === "foundation" || tier === "skeleton") {
    return (
      <g transform={`translate(${x},${y})`}>
        <polygon points={`${-hw - oh},0 0,${-peakH} ${hw + oh},0`}
          fill="none" stroke={p.stroke} strokeWidth={p.strokeW}
          strokeDasharray={p.dasharray} opacity={p.opacity} />
      </g>
    );
  }

  // Construction: partial outline
  if (tier === "construction") {
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-hw - oh} y={-1} width={(hw + oh) * 2} height={2.5}
          fill="none" stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} />
        <polygon points={`${-hw - oh},0 0,${-peakH} ${hw + oh},0`}
          fill="none" stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} />
      </g>
    );
  }

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Cornice */}
      <rect x={-hw - oh} y={-1} width={(hw + oh) * 2} height={2.5}
        fill={`url(#${prefix}glass)`} stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} />
      {/* Pediment */}
      <polygon points={`${-hw - oh},0 0,${-peakH} ${hw + oh},0`}
        fill={`url(#${prefix}glass)`} stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} />

      {/* Tympanum relief for complete/imperial */}
      <g opacity={0.4}>
        <circle cx={0} cy={-peakH * 0.42} r={peakH / 4.5} fill="none" stroke={p.accent} strokeWidth={0.4} />
        {tier === "imperial" && (
          <circle cx={0} cy={-peakH * 0.42} r={peakH / 7} fill="none" stroke={p.accent} strokeWidth={0.3} />
        )}
      </g>

      {/* Acroteria for imperial */}
      {tier === "imperial" && (
        <>
          <line x1={0} y1={-peakH} x2={0} y2={-peakH - 5} stroke={p.stroke} strokeWidth={0.5} />
          <circle cx={0} cy={-peakH - 6} r={1.5} fill="none" stroke={p.stroke} strokeWidth={0.4} />
          <line x1={-hw - oh} y1={0} x2={-hw - oh} y2={-4} stroke={p.stroke} strokeWidth={0.4} />
          <circle cx={-hw - oh} cy={-4.8} r={1} fill="none" stroke={p.stroke} strokeWidth={0.3} />
          <line x1={hw + oh} y1={0} x2={hw + oh} y2={-4} stroke={p.stroke} strokeWidth={0.4} />
          <circle cx={hw + oh} cy={-4.8} r={1} fill="none" stroke={p.stroke} strokeWidth={0.3} />
        </>
      )}
    </g>
  );
}

// ─── Dome Roof ───────────────────────────────────────────

export function DomeRoof({ tier, x = 0, y = 0, width = 40, prefix = "" }: PrimitiveProps & { width?: number }) {
  const p = PHASE_PALETTE[tier];
  const hw = width / 2;
  const dh = hw * 0.9;

  const isEarly = tier === "foundation" || tier === "skeleton";

  return (
    <g transform={`translate(${x},${y})`}>
      <path
        d={`M${-hw},0 C${-hw},${-dh * 0.6} ${-hw * 0.5},${-dh} 0,${-dh} C${hw * 0.5},${-dh} ${hw},${-dh * 0.6} ${hw},0`}
        fill={isEarly ? "none" : `url(#${prefix}glass)`}
        stroke={p.stroke} strokeWidth={p.strokeW}
        strokeDasharray={isEarly ? p.dasharray : undefined}
        opacity={p.opacity}
      />
      {/* Ribs for construction+ */}
      {!isEarly && [0.3, 0.5, 0.7].map(t => {
        const rx = hw * (1 - t);
        return (
          <path key={t}
            d={`M${-rx},${-dh * t * 0.3} C${-rx},${-dh * (t + 0.15)} ${-rx * 0.3},${-dh * 0.95} 0,${-dh} C${rx * 0.3},${-dh * 0.95} ${rx},${-dh * (t + 0.15)} ${rx},${-dh * t * 0.3}`}
            fill="none" stroke={p.stroke} strokeWidth={0.2} opacity={0.25} />
        );
      })}
      {/* Lantern for imperial */}
      {tier === "imperial" && (
        <g>
          <rect x={-2} y={-dh - 4} width={4} height={4} fill="none" stroke={p.stroke} strokeWidth={0.4} rx={0.5} />
          <circle cx={0} cy={-dh - 5.5} r={1.2} fill="none" stroke={p.stroke} strokeWidth={0.4} />
        </g>
      )}
    </g>
  );
}

// ─── Stepped Base (Stylobate) ────────────────────────────

export function Base({ tier, x = 0, y = 0, width = 90, prefix = "" }: PrimitiveProps & { width?: number }) {
  const p = PHASE_PALETTE[tier];
  const hw = width / 2;
  const steps = tier === "foundation" ? 1 : tier === "skeleton" ? 1 : tier === "construction" ? 2 : tier === "complete" ? 3 : 4;

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Drop shadow */}
      <ellipse cx={0} cy={steps * 3 + 2} rx={hw + steps * 4 + 6} ry={2.5}
        fill={`url(#${prefix}base-shadow)`} />

      {Array.from({ length: steps }).map((_, i) => {
        const sw = hw + (steps - i) * 4;
        const sy = i * 3;
        const inset = i * 0.3;
        return (
          <polygon key={i}
            points={`${-sw + inset},${sy} ${sw - inset},${sy} ${sw},${sy + 3} ${-sw},${sy + 3}`}
            fill={tier === "foundation" ? "none" : `url(#${prefix}glass)`}
            stroke={p.stroke} strokeWidth={p.strokeW}
            strokeDasharray={tier === "foundation" ? p.dasharray : undefined}
            opacity={p.opacity}
          />
        );
      })}

      {/* Excavation marks for foundation */}
      {tier === "foundation" && (
        <g opacity={0.2}>
          {[-hw + 10, -hw / 2, 0, hw / 2, hw - 10].map((mx, i) => (
            <line key={i} x1={mx - 3} y1={4} x2={mx + 3} y2={6}
              stroke={p.stroke} strokeWidth={0.3} />
          ))}
        </g>
      )}
    </g>
  );
}

// ─── Voussoir Arch ───────────────────────────────────────

export function Arch({ tier, x = 0, y = 0, width = 20, height = 30, prefix = "" }: PrimitiveProps & { width?: number; height?: number }) {
  const p = PHASE_PALETTE[tier];
  const hw = width / 2;
  const archTop = -height + hw;
  const isEarly = tier === "foundation" || tier === "skeleton";

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Inner shadow (construction+) */}
      {!isEarly && (
        <path
          d={`M${-hw},0 L${-hw},${archTop} A${hw},${hw} 0 0,1 ${hw},${archTop} L${hw},0 Z`}
          fill={`url(#${prefix}arch-shadow)`}
        />
      )}

      {/* Arch outline */}
      <path
        d={`M${-hw},0 L${-hw},${archTop} A${hw},${hw} 0 0,1 ${hw},${archTop} L${hw},0`}
        fill="none" stroke={p.stroke} strokeWidth={p.strokeW}
        strokeDasharray={isEarly ? p.dasharray : undefined}
        opacity={p.opacity}
      />

      {/* Imposts (construction+) */}
      {!isEarly && (
        <>
          <rect x={-hw - 1.5} y={archTop - 0.5} width={3} height={2}
            fill="none" stroke={p.stroke} strokeWidth={0.25} opacity={p.opacity * 0.7} />
          <rect x={hw - 1.5} y={archTop - 0.5} width={3} height={2}
            fill="none" stroke={p.stroke} strokeWidth={0.25} opacity={p.opacity * 0.7} />
        </>
      )}

      {/* Keystone (complete+) */}
      {(tier === "complete" || tier === "imperial") && (
        <polygon
          points={`${-2.5},${-height + 1} 0,${-height - 0.5} ${2.5},${-height + 1} ${2},${-height + 3.5} ${-2},${-height + 3.5}`}
          fill="none" stroke={p.accent} strokeWidth={0.3} opacity={p.opacity * 0.6}
        />
      )}
    </g>
  );
}

// ─── Wall ────────────────────────────────────────────────

export function Wall({ tier, x = 0, y = 0, width = 60, height = 50, prefix = "" }: PrimitiveProps & { width?: number; height?: number }) {
  const p = PHASE_PALETTE[tier];
  const isEarly = tier === "foundation" || tier === "skeleton";

  // Foundation: only footprint outline
  if (tier === "foundation") {
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={0} y={-height} width={width} height={height}
          fill="none" stroke={p.stroke} strokeWidth={p.strokeW}
          strokeDasharray={p.dasharray} opacity={p.opacity} />
      </g>
    );
  }

  // Skeleton: wireframe with scaffolding grid
  if (tier === "skeleton") {
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={0} y={-height} width={width} height={height}
          fill="none" stroke={p.stroke} strokeWidth={p.strokeW}
          strokeDasharray={p.dasharray} opacity={p.opacity} />
        {/* Scaffolding grid */}
        <g opacity={0.2}>
          {Array.from({ length: Math.floor(height / 12) }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={-i * 12} x2={width} y2={-i * 12}
              stroke={p.stroke} strokeWidth={0.2} strokeDasharray="2,3" />
          ))}
          {Array.from({ length: Math.floor(width / 15) }).map((_, i) => (
            <line key={`v${i}`} x1={(i + 1) * 15} y1={0} x2={(i + 1) * 15} y2={-height}
              stroke={p.stroke} strokeWidth={0.2} strokeDasharray="2,3" />
          ))}
        </g>
      </g>
    );
  }

  // Construction: partial height, no fill
  if (tier === "construction") {
    const builtH = height * 0.6;
    return (
      <g transform={`translate(${x},${y})`}>
        {/* Full outline dashed */}
        <rect x={0} y={-height} width={width} height={height}
          fill="none" stroke={p.accent} strokeWidth={0.2}
          strokeDasharray="4,4" opacity={0.2} />
        {/* Built portion */}
        <rect x={0} y={-builtH} width={width} height={builtH}
          fill={`url(#${prefix}glass)`} fillOpacity={0.4}
          stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} />
      </g>
    );
  }

  // Complete/Imperial: full with glass fill
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={0} y={-height} width={width} height={height}
        fill={`url(#${prefix}glass)`} stroke={p.stroke} strokeWidth={p.strokeW} opacity={p.opacity} />

      {/* Ashlar blocks for complete */}
      {tier === "complete" && (
        <g opacity={0.15}>
          {Array.from({ length: Math.floor(height / 7) }).map((_, row) => (
            <g key={row}>
              <line x1={0} y1={-row * 7} x2={width} y2={-row * 7}
                stroke={p.stroke} strokeWidth={0.2} />
              {Array.from({ length: Math.floor(width / 12) }).map((_, col) => (
                <line key={col}
                  x1={(col + 1) * 12 + (row % 2 ? 6 : 0)} y1={-row * 7}
                  x2={(col + 1) * 12 + (row % 2 ? 6 : 0)} y2={-row * 7 - 7}
                  stroke={p.stroke} strokeWidth={0.12} />
              ))}
            </g>
          ))}
        </g>
      )}

      {/* Imperial: inner molding + decorative lines */}
      {tier === "imperial" && (
        <g>
          <rect x={2} y={-height + 2} width={width - 4} height={height - 4}
            fill="none" stroke={p.accent} strokeWidth={0.3} opacity={0.2} rx={0.5} />
          <g opacity={0.08}>
            <path d={`M${width * 0.2},${-height} Q${width * 0.3},${-height * 0.5} ${width * 0.15},0`}
              fill="none" stroke={p.stroke} strokeWidth={0.4} />
            <path d={`M${width * 0.7},${-height} Q${width * 0.6},${-height * 0.4} ${width * 0.75},0`}
              fill="none" stroke={p.stroke} strokeWidth={0.35} />
          </g>
        </g>
      )}
    </g>
  );
}

// ─── Scaffolding Overlay (for skeleton/construction phase) ─

export function ScaffoldingOverlay({ x = 0, y = 0, width = 120, height = 70 }: { x?: number; y?: number; width?: number; height?: number }) {
  const stroke = "hsl(45,50%,40%)";
  return (
    <g transform={`translate(${x},${y})`} opacity={0.25}>
      {/* Vertical poles */}
      {[0, width * 0.33, width * 0.66, width].map((px, i) => (
        <line key={`v${i}`} x1={px} y1={0} x2={px} y2={-height}
          stroke={stroke} strokeWidth={0.4} />
      ))}
      {/* Horizontal planks */}
      {Array.from({ length: Math.floor(height / 15) }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={-i * 15} x2={width} y2={-i * 15}
          stroke={stroke} strokeWidth={0.3} />
      ))}
      {/* Diagonal cross-bracing */}
      {Array.from({ length: Math.floor(height / 15) - 1 }).map((_, i) => (
        <g key={`d${i}`}>
          <line x1={0} y1={-i * 15} x2={width * 0.33} y2={-(i + 1) * 15}
            stroke={stroke} strokeWidth={0.2} />
          <line x1={width * 0.66} y1={-i * 15} x2={width} y2={-(i + 1) * 15}
            stroke={stroke} strokeWidth={0.2} />
        </g>
      ))}
    </g>
  );
}

// ─── Statue placeholder (imperial decoration) ───────────

export function StatuePlaceholder({ x = 0, y = 0, size = 8 }: { x?: number; y?: number; size?: number }) {
  const stroke = "hsl(45,90%,55%)";
  const s = size;
  return (
    <g transform={`translate(${x},${y})`} opacity={0.5}>
      {/* Pedestal */}
      <rect x={-s / 2} y={0} width={s} height={s * 0.4} fill="none" stroke={stroke} strokeWidth={0.3} />
      {/* Figure outline */}
      <ellipse cx={0} cy={-s * 0.3} rx={s * 0.15} ry={s * 0.2} fill="none" stroke={stroke} strokeWidth={0.3} />
      <line x1={0} y1={-s * 0.1} x2={0} y2={-s * 0.7} stroke={stroke} strokeWidth={0.3} />
      <ellipse cx={0} cy={-s * 0.8} rx={s * 0.12} ry={s * 0.12} fill="none" stroke={stroke} strokeWidth={0.3} />
    </g>
  );
}
