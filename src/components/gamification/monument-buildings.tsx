/**
 * 9 + 1 Roman Building Composers
 * Each uses SVG primitives from monument-svg.tsx.
 * All share viewBox "0 0 200 160" for consistent sizing.
 */
import type { MaterialTier } from "@/lib/forum-logic";
import { Column, TriangularRoof, DomeRoof, Base, Arch, Wall, TIER_FILLS } from "./monument-svg";

import type { BuildingType } from "@/lib/forum-logic";

export const BUILDING_LABELS: Record<BuildingType, string> = {
  amphitheatrum: "Amphitheatrum",
  basilica: "Basilica",
  tabularium: "Tabulārium",
  rostra: "Rostra",
  curia: "Cūria",
  macellum: "Macellum",
  argentaria: "Argentāria",
  templum: "Templum",
  arcus: "Arcus",
  insula: "Insula",
};

interface BuildingProps {
  tier: MaterialTier;
}

// ─── Amphitheatrum (Circular, tiered arches) ─────────────
function Amphitheatrum({ tier }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      {/* Elliptical base structure */}
      <ellipse cx={100} cy={130} rx={75} ry={20} fill={c.primary} stroke={c.stroke} strokeWidth={0.6} />
      {/* Three tiers of arches */}
      {[0, 1, 2].map(row => {
        const y = 130 - row * 25;
        const rx = 75 - row * 8;
        const count = 7 - row;
        return (
          <g key={row}>
            <ellipse cx={100} cy={y} rx={rx} ry={18 - row * 2} fill="none" stroke={c.stroke} strokeWidth={0.5} />
            {Array.from({ length: count }).map((_, i) => {
              const angle = (Math.PI / (count + 1)) * (i + 1);
              const ax = 100 - rx * Math.cos(angle);
              return <Arch key={i} tier={tier} x={ax} y={y - 2} width={10 - row} height={16 - row * 2} />;
            })}
          </g>
        );
      })}
      <Base tier={tier} x={100} y={132} width={160} />
    </g>
  );
}

// ─── Basilica (Long hall with apse) ──────────────────────
function Basilica({ tier }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <Wall tier={tier} x={30} y={130} width={120} height={60} />
      {/* Apse (semicircle on right) */}
      <path d={`M150,130 L150,70 A25,30 0 0,1 150,130 Z`} fill={c.secondary} stroke={c.stroke} strokeWidth={0.6} />
      {/* Columns along the front */}
      {[45, 65, 85, 105, 125].map(cx => (
        <Column key={cx} tier={tier} x={cx} y={130} />
      ))}
      <TriangularRoof tier={tier} x={90} y={68} width={130} />
      <Base tier={tier} x={90} y={132} width={140} />
    </g>
  );
}

// ─── Tabularium (Fortified archive) ──────────────────────
function Tabularium({ tier }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <Wall tier={tier} x={25} y={130} width={150} height={70} />
      {/* Two rows of arched windows */}
      {[0, 1].map(row => (
        <g key={row}>
          {[50, 75, 100, 125, 150].map(wx => (
            <Arch key={wx} tier={tier} x={wx} y={130 - 20 - row * 30} width={12} height={18} />
          ))}
        </g>
      ))}
      {/* Heavy cornice */}
      <rect x={23} y={58} width={154} height={4} fill={c.secondary} stroke={c.stroke} strokeWidth={0.5} />
      <Base tier={tier} x={100} y={132} width={160} />
    </g>
  );
}

// ─── Rostra (Elevated platform with prows) ───────────────
function Rostra({ tier }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      {/* Elevated platform */}
      <rect x={35} y={90} width={130} height={40} fill={c.primary} stroke={c.stroke} strokeWidth={0.6} />
      {/* Steps */}
      {[0, 1, 2, 3].map(i => (
        <rect key={i} x={35 - i * 3} y={130 + i * 4} width={130 + i * 6} height={4} fill={c.secondary} stroke={c.stroke} strokeWidth={0.3} />
      ))}
      {/* Three ship prows (triangles) */}
      {[65, 100, 135].map(px => (
        <polygon key={px} points={`${px},110 ${px - 6},130 ${px + 6},130`} fill={c.accent} stroke={c.stroke} strokeWidth={0.5} />
      ))}
      {/* Balustrade columns */}
      {[50, 70, 90, 110, 130, 150].map(cx => (
        <rect key={cx} x={cx - 1.5} y={75} width={3} height={15} fill={c.secondary} stroke={c.stroke} strokeWidth={0.3} />
      ))}
      <line x1={48} y1={75} x2={152} y2={75} stroke={c.stroke} strokeWidth={0.6} />
    </g>
  );
}

// ─── Curia (Tall senate hall) ────────────────────────────
function Curia({ tier }: BuildingProps) {
  return (
    <g>
      <Wall tier={tier} x={50} y={130} width={100} height={75} />
      {/* Grand entrance */}
      <Arch tier={tier} x={100} y={130} width={24} height={36} />
      <TriangularRoof tier={tier} x={100} y={53} width={110} />
      <Base tier={tier} x={100} y={132} width={120} />
    </g>
  );
}

// ─── Macellum (Circular market with tholos) ──────────────
function Macellum({ tier }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      {/* Circular outline */}
      <ellipse cx={100} cy={120} rx={65} ry={18} fill={c.primary} stroke={c.stroke} strokeWidth={0.5} />
      {/* Surrounding colonnade */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (Math.PI / 9) * (i + 1);
        const cx = 100 - 55 * Math.cos(angle);
        return <Column key={i} tier={tier} x={cx} y={120} />;
      })}
      {/* Central tholos */}
      <Column tier={tier} x={100} y={120} />
      <DomeRoof tier={tier} x={100} y={58} width={30} />
      <Base tier={tier} x={100} y={132} width={140} />
    </g>
  );
}

// ─── Argentaria (Columned portico / Bank) ────────────────
function Argentaria({ tier }: BuildingProps) {
  return (
    <g>
      <Wall tier={tier} x={45} y={130} width={110} height={60} />
      {/* Front colonnade */}
      {[55, 75, 95, 115, 135, 145].map(cx => (
        <Column key={cx} tier={tier} x={cx} y={130} />
      ))}
      <TriangularRoof tier={tier} x={100} y={68} width={120} />
      <Base tier={tier} x={100} y={132} width={130} />
    </g>
  );
}

// ─── Templum (Grand temple) ─────────────────────────────
function Templum({ tier }: BuildingProps) {
  return (
    <g>
      <Wall tier={tier} x={40} y={130} width={120} height={65} />
      {/* Six front columns */}
      {[50, 66, 82, 118, 134, 150].map(cx => (
        <Column key={cx} tier={tier} x={cx} y={130} />
      ))}
      <TriangularRoof tier={tier} x={100} y={63} width={130} />
      {/* Wide staircase */}
      {[0, 1, 2, 3, 4].map(i => (
        <rect key={i} x={38 - i * 3} y={132 + i * 3} width={124 + i * 6} height={3} fill={TIER_FILLS[tier].secondary} stroke={TIER_FILLS[tier].stroke} strokeWidth={0.3} />
      ))}
    </g>
  );
}

// ─── Arcus (Triumphal arch) ─────────────────────────────
function Arcus({ tier }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      {/* Main structure */}
      <rect x={50} y={50} width={100} height={80} fill={c.primary} stroke={c.stroke} strokeWidth={0.6} />
      {/* Central large arch */}
      <Arch tier={tier} x={100} y={130} width={30} height={55} />
      {/* Two smaller flanking arches */}
      <Arch tier={tier} x={68} y={130} width={16} height={35} />
      <Arch tier={tier} x={132} y={130} width={16} height={35} />
      {/* Attic on top */}
      <rect x={48} y={45} width={104} height={12} fill={c.secondary} stroke={c.stroke} strokeWidth={0.5} />
      {/* Columns flanking arches */}
      {[58, 78, 122, 142].map(cx => (
        <Column key={cx} tier={tier} x={cx} y={130} />
      ))}
      <Base tier={tier} x={100} y={132} width={120} />
    </g>
  );
}

// ─── Insula (Generic fallback building) ──────────────────
function Insula({ tier }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <Wall tier={tier} x={45} y={130} width={110} height={75} />
      {/* Three rows of windows */}
      {[0, 1, 2].map(row => (
        <g key={row}>
          {[65, 85, 105, 125, 140].map(wx => (
            <rect key={wx} x={wx} y={65 + row * 22} width={8} height={12} fill="none" stroke={c.stroke} strokeWidth={0.5} rx={tier === "wood" ? 0 : 1} />
          ))}
        </g>
      ))}
      {/* Door */}
      <Arch tier={tier} x={100} y={130} width={14} height={22} />
      <Base tier={tier} x={100} y={132} width={120} />
    </g>
  );
}

// ─── Main MonumentSVG Component ──────────────────────────

interface MonumentSVGProps {
  buildingType: BuildingType;
  tier: MaterialTier;
  className?: string;
}

const BUILDING_MAP: Record<BuildingType, React.FC<BuildingProps>> = {
  amphitheatrum: Amphitheatrum,
  basilica: Basilica,
  tabularium: Tabularium,
  rostra: Rostra,
  curia: Curia,
  macellum: Macellum,
  argentaria: Argentaria,
  templum: Templum,
  arcus: Arcus,
  insula: Insula,
};

export function MonumentSVG({ buildingType, tier, className }: MonumentSVGProps) {
  const BuildingComponent = BUILDING_MAP[buildingType] || Insula;
  return (
    <svg viewBox="0 0 200 160" className={className} style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMax meet">
      <BuildingComponent tier={tier} />
    </svg>
  );
}
