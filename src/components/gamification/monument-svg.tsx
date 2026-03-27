/**
 * Premium SVG Primitive Library for Roman Forum Monuments
 * Sophisticated 2D vector illustrations with gradient fills,
 * entasis columns, voussoir arches, and refined architectural detail.
 * viewBox: 0 0 200 160
 */
import type { MaterialTier } from "@/lib/forum-logic";

// ─── Tier Color Palette (kept for backward compat) ───────
export const TIER_FILLS: Record<MaterialTier, { primary: string; secondary: string; accent: string; stroke: string }> = {
  wood:   { primary: "hsl(30, 50%, 35%)",  secondary: "hsl(30, 40%, 45%)",  accent: "hsl(30, 60%, 25%)",  stroke: "hsl(30, 30%, 20%)" },
  brick:  { primary: "hsl(15, 60%, 40%)",  secondary: "hsl(15, 50%, 50%)",  accent: "hsl(15, 70%, 30%)",  stroke: "hsl(15, 40%, 25%)" },
  stone:  { primary: "hsl(0, 0%, 50%)",    secondary: "hsl(0, 0%, 60%)",    accent: "hsl(0, 0%, 40%)",    stroke: "hsl(0, 0%, 30%)" },
  marble: { primary: "hsl(210, 15%, 85%)", secondary: "hsl(210, 20%, 92%)", accent: "hsl(210, 10%, 75%)", stroke: "hsl(210, 10%, 60%)" },
  gold:   { primary: "hsl(45, 80%, 55%)",  secondary: "hsl(45, 90%, 70%)",  accent: "hsl(45, 70%, 40%)",  stroke: "hsl(35, 60%, 30%)" },
};

// ─── Gradient Definitions (render once per SVG) ──────────

const GRADIENT_SPECS: Record<MaterialTier, { id: string; stops: [string, string, string] }> = {
  wood:   { id: "tier-wood",   stops: ["hsl(30,45%,28%)", "hsl(30,50%,38%)", "hsl(30,42%,32%)"] },
  brick:  { id: "tier-brick",  stops: ["hsl(12,55%,35%)", "hsl(15,60%,45%)", "hsl(10,50%,38%)"] },
  stone:  { id: "tier-stone",  stops: ["hsl(220,5%,45%)", "hsl(220,8%,58%)", "hsl(220,5%,50%)"] },
  marble: { id: "tier-marble", stops: ["hsl(210,20%,88%)", "hsl(210,25%,95%)", "hsl(215,18%,90%)"] },
  gold:   { id: "tier-gold",   stops: ["hsl(40,75%,45%)", "hsl(45,90%,62%)", "hsl(38,80%,50%)"] },
};

export function TierGradientDefs({ tier, prefix = "" }: { tier: MaterialTier; prefix?: string }) {
  const spec = GRADIENT_SPECS[tier];
  const id = prefix + spec.id;
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={spec.stops[0]} />
        <stop offset="50%" stopColor={spec.stops[1]} />
        <stop offset="100%" stopColor={spec.stops[2]} />
      </linearGradient>
      <linearGradient id={`${id}-h`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={spec.stops[0]} />
        <stop offset="50%" stopColor={spec.stops[1]} />
        <stop offset="100%" stopColor={spec.stops[2]} />
      </linearGradient>
      {/* Inner shadow for arches */}
      <radialGradient id={`${prefix}arch-shadow`}>
        <stop offset="0%" stopColor="hsl(0,0%,10%)" stopOpacity={0.15} />
        <stop offset="100%" stopColor="hsl(0,0%,10%)" stopOpacity={0} />
      </radialGradient>
      {/* Drop shadow for bases */}
      <radialGradient id={`${prefix}base-shadow`} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
        <stop offset="0%" stopColor="hsl(0,0%,0%)" stopOpacity={0.12} />
        <stop offset="100%" stopColor="hsl(0,0%,0%)" stopOpacity={0} />
      </radialGradient>
    </defs>
  );
}

interface PrimitiveProps {
  tier: MaterialTier;
  x?: number;
  y?: number;
  prefix?: string;
}

function gid(tier: MaterialTier, prefix = "") {
  return `url(#${prefix}${GRADIENT_SPECS[tier].id})`;
}

function ghid(tier: MaterialTier, prefix = "") {
  return `url(#${prefix}${GRADIENT_SPECS[tier].id}-h)`;
}

// ─── Column with Entasis ─────────────────────────────────

export function Column({ tier, x = 0, y = 0, prefix = "" }: PrimitiveProps & { height?: number }) {
  const c = TIER_FILLS[tier];
  const h = 58;
  // Entasis: subtle belly curve
  const bw = tier === "wood" ? 3 : 5; // half-width at base
  const tw = tier === "wood" ? 2.5 : 4; // half-width at top
  const mw = bw + 0.8; // belly max

  const shaft = `M${-bw},0 C${-bw},${-h * 0.3} ${-mw},${-h * 0.5} ${-tw},${-h} L${tw},${-h} C${mw},${-h * 0.5} ${bw},${-h * 0.3} ${bw},0 Z`;

  const flutingCount = tier === "wood" ? 0 : tier === "brick" ? 0 : tier === "stone" ? 4 : tier === "marble" ? 5 : 5;

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Shaft with entasis */}
      <path d={shaft} fill={gid(tier, prefix)} stroke={c.stroke} strokeWidth={0.5} />

      {/* Fluting */}
      {flutingCount > 0 && Array.from({ length: flutingCount }).map((_, i) => {
        const fx = -bw + 1.5 + (i * (bw * 2 - 3)) / (flutingCount - 1);
        return (
          <line key={i} x1={fx * 0.95} y1={-2} x2={fx * (tw / bw) * 0.95} y2={-h + 3}
            stroke={c.accent} strokeWidth={0.2} opacity={0.35} />
        );
      })}

      {/* Capital */}
      {tier === "wood" && (
        <rect x={-tw - 1} y={-h - 2} width={(tw + 1) * 2} height={2.5} fill={c.secondary} stroke={c.stroke} strokeWidth={0.3} rx={0.3} />
      )}
      {tier === "brick" && (
        <rect x={-bw - 1} y={-h - 3} width={(bw + 1) * 2} height={3} fill={c.secondary} stroke={c.stroke} strokeWidth={0.4} rx={0.5} />
      )}
      {tier === "stone" && (
        <g>
          {/* Doric: echinus + abacus */}
          <path d={`M${-tw - 2},${-h} Q${-tw},${-h - 3} 0,${-h - 3.5} Q${tw},${-h - 3} ${tw + 2},${-h}`} fill={c.secondary} stroke={c.stroke} strokeWidth={0.4} />
          <rect x={-tw - 3} y={-h - 5.5} width={(tw + 3) * 2} height={2} fill={c.secondary} stroke={c.stroke} strokeWidth={0.4} />
        </g>
      )}
      {tier === "marble" && (
        <g>
          {/* Ionic: volutes */}
          <rect x={-tw - 3.5} y={-h - 4} width={(tw + 3.5) * 2} height={4} fill={c.secondary} stroke={c.stroke} strokeWidth={0.35} rx={0.8} />
          <circle cx={-tw - 2.5} cy={-h - 2} r={2} fill="none" stroke={c.stroke} strokeWidth={0.4} />
          <circle cx={tw + 2.5} cy={-h - 2} r={2} fill="none" stroke={c.stroke} strokeWidth={0.4} />
          <circle cx={-tw - 2.5} cy={-h - 2} r={0.8} fill={c.accent} opacity={0.4} />
          <circle cx={tw + 2.5} cy={-h - 2} r={0.8} fill={c.accent} opacity={0.4} />
        </g>
      )}
      {tier === "gold" && (
        <g>
          {/* Corinthian: acanthus leaves */}
          <rect x={-tw - 4} y={-h - 7} width={(tw + 4) * 2} height={7} fill={c.secondary} stroke={c.stroke} strokeWidth={0.35} rx={0.8} />
          <path d={`M${-tw - 1},${-h} Q${-tw + 1},${-h - 4} 0,${-h - 5} Q${tw - 1},${-h - 4} ${tw + 1},${-h}`}
            fill="none" stroke={c.accent} strokeWidth={0.5} opacity={0.6} />
          <path d={`M${-tw},${-h - 1} Q${-tw + 2},${-h - 6} 0,${-h - 6.5} Q${tw - 2},${-h - 6} ${tw},${-h - 1}`}
            fill="none" stroke={c.accent} strokeWidth={0.35} opacity={0.5} />
        </g>
      )}

      {/* Base plinth */}
      <rect x={-bw - 1} y={0} width={(bw + 1) * 2} height={3} fill={c.secondary} stroke={c.stroke} strokeWidth={0.3} rx={tier === "wood" ? 0 : 0.5} />
    </g>
  );
}

// ─── Triangular Roof (Pediment) ──────────────────────────

export function TriangularRoof({ tier, x = 0, y = 0, width = 80, prefix = "" }: PrimitiveProps & { width?: number }) {
  const c = TIER_FILLS[tier];
  const hw = width / 2;
  const oh = 4; // overhang
  const peakH = tier === "gold" ? 22 : tier === "marble" ? 20 : 17;

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Cornice (extends beyond columns) */}
      <rect x={-hw - oh} y={-1} width={(hw + oh) * 2} height={2.5} fill={ghid(tier, prefix)} stroke={c.stroke} strokeWidth={0.6} />

      {/* Pediment triangle */}
      <polygon
        points={`${-hw - oh},0 0,${-peakH} ${hw + oh},0`}
        fill={gid(tier, prefix)}
        stroke={c.stroke}
        strokeWidth={0.5}
      />

      {/* Tympanum relief for marble+ */}
      {(tier === "marble" || tier === "gold") && (
        <g opacity={0.5}>
          <circle cx={0} cy={-peakH * 0.42} r={peakH / 4.5} fill="none" stroke={c.stroke} strokeWidth={0.4} />
          {tier === "gold" && (
            <circle cx={0} cy={-peakH * 0.42} r={peakH / 7} fill="none" stroke={c.accent} strokeWidth={0.3} />
          )}
        </g>
      )}

      {/* Acroteria finials for gold */}
      {tier === "gold" && (
        <>
          <line x1={0} y1={-peakH} x2={0} y2={-peakH - 5} stroke={c.stroke} strokeWidth={0.5} />
          <circle cx={0} cy={-peakH - 6} r={1.5} fill={c.primary} stroke={c.stroke} strokeWidth={0.3} />
          <line x1={-hw - oh} y1={0} x2={-hw - oh} y2={-4} stroke={c.stroke} strokeWidth={0.4} />
          <circle cx={-hw - oh} cy={-4.8} r={1} fill={c.primary} stroke={c.stroke} strokeWidth={0.3} />
          <line x1={hw + oh} y1={0} x2={hw + oh} y2={-4} stroke={c.stroke} strokeWidth={0.4} />
          <circle cx={hw + oh} cy={-4.8} r={1} fill={c.primary} stroke={c.stroke} strokeWidth={0.3} />
        </>
      )}
    </g>
  );
}

// ─── Dome Roof ───────────────────────────────────────────

export function DomeRoof({ tier, x = 0, y = 0, width = 40, prefix = "" }: PrimitiveProps & { width?: number }) {
  const c = TIER_FILLS[tier];
  const hw = width / 2;
  const dh = hw * 0.9;

  return (
    <g transform={`translate(${x},${y})`}>
      <path
        d={`M${-hw},0 C${-hw},${-dh * 0.6} ${-hw * 0.5},${-dh} 0,${-dh} C${hw * 0.5},${-dh} ${hw},${-dh * 0.6} ${hw},0`}
        fill={gid(tier, prefix)}
        stroke={c.stroke}
        strokeWidth={0.5}
      />
      {/* Ribs for stone+ */}
      {(tier === "stone" || tier === "marble" || tier === "gold") && [0.3, 0.5, 0.7].map(t => {
        const rx = hw * (1 - t);
        return (
          <path key={t}
            d={`M${-rx},${-dh * t * 0.3} C${-rx},${-dh * (t + 0.15)} ${-rx * 0.3},${-dh * 0.95} 0,${-dh} C${rx * 0.3},${-dh * 0.95} ${rx},${-dh * (t + 0.15)} ${rx},${-dh * t * 0.3}`}
            fill="none" stroke={c.stroke} strokeWidth={0.25} opacity={0.3} />
        );
      })}
      {/* Lantern finial for gold */}
      {tier === "gold" && (
        <g>
          <rect x={-2} y={-dh - 4} width={4} height={4} fill={c.secondary} stroke={c.stroke} strokeWidth={0.3} rx={0.5} />
          <circle cx={0} cy={-dh - 5.5} r={1.2} fill={c.primary} stroke={c.stroke} strokeWidth={0.3} />
        </g>
      )}
    </g>
  );
}

// ─── Stepped Base (Stylobate) ────────────────────────────

export function Base({ tier, x = 0, y = 0, width = 90, prefix = "" }: PrimitiveProps & { width?: number }) {
  const c = TIER_FILLS[tier];
  const hw = width / 2;
  const steps = tier === "wood" ? 1 : tier === "brick" ? 2 : tier === "stone" ? 3 : 4;

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Drop shadow */}
      <ellipse cx={0} cy={steps * 3 + 2} rx={hw + steps * 4 + 6} ry={2.5}
        fill={`url(#${prefix}base-shadow)`} />

      {Array.from({ length: steps }).map((_, i) => {
        const sw = hw + (steps - i) * 4;
        const sy = i * 3;
        // Slight perspective trapezoid
        const inset = i * 0.3;
        return (
          <polygon
            key={i}
            points={`${-sw + inset},${sy} ${sw - inset},${sy} ${sw},${sy + 3} ${-sw},${sy + 3}`}
            fill={i === 0 ? c.secondary : gid(tier, prefix)}
            stroke={c.stroke}
            strokeWidth={0.35}
          />
        );
      })}
    </g>
  );
}

// ─── Voussoir Arch ───────────────────────────────────────

export function Arch({ tier, x = 0, y = 0, width = 20, height = 30, prefix = "" }: PrimitiveProps & { width?: number; height?: number }) {
  const c = TIER_FILLS[tier];
  const hw = width / 2;
  const archTop = -height + hw;

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Inner shadow */}
      <path
        d={`M${-hw},0 L${-hw},${archTop} A${hw},${hw} 0 0,1 ${hw},${archTop} L${hw},0 Z`}
        fill={`url(#${prefix}arch-shadow)`}
      />

      {/* Arch outline */}
      <path
        d={`M${-hw},0 L${-hw},${archTop} A${hw},${hw} 0 0,1 ${hw},${archTop} L${hw},0`}
        fill="none"
        stroke={c.stroke}
        strokeWidth={0.7}
      />

      {/* Imposts (spring points) */}
      <rect x={-hw - 1.5} y={archTop - 0.5} width={3} height={2} fill={c.secondary} stroke={c.stroke} strokeWidth={0.25} />
      <rect x={hw - 1.5} y={archTop - 0.5} width={3} height={2} fill={c.secondary} stroke={c.stroke} strokeWidth={0.25} />

      {/* Keystone */}
      {(tier !== "wood") && (
        <polygon
          points={`${-2.5},${-height + 1} 0,${-height - 0.5} ${2.5},${-height + 1} ${2},${-height + 3.5} ${-2},${-height + 3.5}`}
          fill={c.secondary}
          stroke={c.stroke}
          strokeWidth={0.3}
        />
      )}
    </g>
  );
}

// ─── Refined Wall ────────────────────────────────────────

export function Wall({ tier, x = 0, y = 0, width = 60, height = 50, prefix = "" }: PrimitiveProps & { width?: number; height?: number }) {
  const c = TIER_FILLS[tier];
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={0} y={-height} width={width} height={height}
        fill={gid(tier, prefix)} stroke={c.stroke} strokeWidth={0.5} />

      {/* Brick: opus reticulatum diagonal hint */}
      {tier === "brick" && (
        <g opacity={0.2}>
          {Array.from({ length: Math.floor(height / 5) }).map((_, row) => (
            <line key={row} x1={0} y1={-row * 5} x2={width} y2={-row * 5}
              stroke={c.stroke} strokeWidth={0.2} />
          ))}
          {Array.from({ length: Math.floor(width / 8) }).map((_, col) => {
            const cx = (col + 1) * 8;
            return (
              <line key={`d${col}`} x1={cx} y1={0} x2={cx} y2={-height}
                stroke={c.stroke} strokeWidth={0.12} opacity={0.5}
                strokeDasharray="3,4" />
            );
          })}
        </g>
      )}

      {/* Stone: ashlar blocks */}
      {tier === "stone" && (
        <g opacity={0.25}>
          {Array.from({ length: Math.floor(height / 7) }).map((_, row) => (
            <g key={row}>
              <line x1={0} y1={-row * 7} x2={width} y2={-row * 7}
                stroke={c.stroke} strokeWidth={0.25} />
              {Array.from({ length: Math.floor(width / 12) }).map((_, col) => (
                <line key={col}
                  x1={(col + 1) * 12 + (row % 2 ? 6 : 0)} y1={-row * 7}
                  x2={(col + 1) * 12 + (row % 2 ? 6 : 0)} y2={-row * 7 - 7}
                  stroke={c.stroke} strokeWidth={0.15} />
              ))}
            </g>
          ))}
        </g>
      )}

      {/* Marble/Gold: inner molding */}
      {(tier === "marble" || tier === "gold") && (
        <g>
          <rect x={2} y={-height + 2} width={width - 4} height={height - 4}
            fill="none" stroke={c.accent} strokeWidth={0.3} opacity={0.25} rx={0.5} />
          {/* Subtle veining for marble */}
          {tier === "marble" && (
            <g opacity={0.08}>
              <path d={`M${width * 0.2},${-height} Q${width * 0.3},${-height * 0.5} ${width * 0.15},0`}
                fill="none" stroke={c.stroke} strokeWidth={0.5} />
              <path d={`M${width * 0.7},${-height} Q${width * 0.6},${-height * 0.4} ${width * 0.75},0`}
                fill="none" stroke={c.stroke} strokeWidth={0.4} />
            </g>
          )}
        </g>
      )}
    </g>
  );
}
