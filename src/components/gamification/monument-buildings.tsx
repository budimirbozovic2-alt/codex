/**
 * 10 Roman Building Compositions — Premium 2D Vector
 * Uses refined primitives from monument-svg.tsx.
 * All share viewBox "0 0 200 160".
 */
import type { MaterialTier, BuildingType } from "@/lib/forum-logic";
import { Column, TriangularRoof, DomeRoof, Base, Arch, Wall, TIER_FILLS, TierGradientDefs } from "./monument-svg";

export const BUILDING_LABELS: Record<BuildingType, string> = {
  amphitheatrum: "Amfiteatar",
  basilica: "Bazilika",
  tabularium: "Arhiv",
  rostra: "Govornica",
  curia: "Senat",
  macellum: "Tržnica",
  argentaria: "Blagajna",
  templum: "Hram",
  arcus: "Slavoluk",
  insula: "Blok",
};

interface BuildingProps {
  tier: MaterialTier;
  id: string;
}

// ─── Amphitheatrum (3-tier elliptical) ───────────────────
function Amphitheatrum({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      {/* Three tiers */}
      {[0, 1, 2].map(row => {
        const y = 130 - row * 22;
        const rx = 72 - row * 8;
        const ry = 16 - row * 2;
        const count = 6 - row;
        return (
          <g key={row}>
            <ellipse cx={100} cy={y} rx={rx} ry={ry} fill={`url(#${id}${TIER_FILLS[tier].primary ? 'tier-' + tier : ''})`} stroke={c.stroke} strokeWidth={0.4} />
            {/* Cornice band */}
            <ellipse cx={100} cy={y - ry + 1} rx={rx - 1} ry={1.5} fill="none" stroke={c.stroke} strokeWidth={0.3} opacity={0.4} />
            {Array.from({ length: count }).map((_, i) => {
              const angle = (Math.PI / (count + 1)) * (i + 1);
              const ax = 100 - (rx - 4) * Math.cos(angle);
              return <Arch key={i} tier={tier} x={ax} y={y - 1} width={9 - row} height={14 - row * 2} prefix={id} />;
            })}
          </g>
        );
      })}
      <Base tier={tier} x={100} y={132} width={155} prefix={id} />
    </g>
  );
}

// ─── Basilica (Elongated nave with apse) ─────────────────
function Basilica({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      <Wall tier={tier} x={28} y={130} width={125} height={58} prefix={id} />
      {/* Apse semicircle */}
      <path d={`M153,130 L153,72 A20,29 0 0,1 153,130 Z`} fill={c.secondary} stroke={c.stroke} strokeWidth={0.5} />
      {/* Clerestory windows */}
      {[45, 62, 79, 96, 113, 130].map(wx => (
        <rect key={wx} x={wx} y={76} width={5} height={10} fill="none" stroke={c.stroke} strokeWidth={0.3} rx={tier === "wood" ? 0 : 1} opacity={0.5} />
      ))}
      {/* Front colonnade */}
      {[40, 58, 76, 94, 112, 130].map(cx => (
        <Column key={cx} tier={tier} x={cx} y={130} prefix={id} />
      ))}
      <TriangularRoof tier={tier} x={90} y={70} width={135} prefix={id} />
      <Base tier={tier} x={90} y={132} width={145} prefix={id} />
    </g>
  );
}

// ─── Tabularium (Rusticated archive) ─────────────────────
function Tabularium({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      {/* Rusticated ground floor */}
      <Wall tier={tier} x={22} y={130} width={156} height={35} prefix={id} />
      {/* Upper arcaded gallery */}
      <Wall tier={tier} x={22} y={95} width={156} height={35} prefix={id} />
      {/* Arched windows — upper */}
      {[48, 72, 96, 120, 144].map(wx => (
        <Arch key={wx} tier={tier} x={wx} y={92} width={11} height={18} prefix={id} />
      ))}
      {/* Arched openings — lower */}
      {[48, 72, 96, 120, 144].map(wx => (
        <Arch key={`l${wx}`} tier={tier} x={wx} y={128} width={11} height={16} prefix={id} />
      ))}
      {/* Heavy entablature */}
      <rect x={20} y={58} width={160} height={3.5} fill={c.secondary} stroke={c.stroke} strokeWidth={0.5} />
      <rect x={21} y={61.5} width={158} height={1.5} fill={c.accent} stroke={c.stroke} strokeWidth={0.2} opacity={0.4} />
      <Base tier={tier} x={100} y={132} width={165} prefix={id} />
    </g>
  );
}

// ─── Rostra (Elevated speaker platform) ──────────────────
function Rostra({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      {/* Platform */}
      <rect x={35} y={90} width={130} height={40} fill={`url(#${id}tier-${tier})`} stroke={c.stroke} strokeWidth={0.5} />
      {/* Steps */}
      {[0, 1, 2].map(i => (
        <polygon key={i}
          points={`${35 - i * 4},${130 + i * 4} ${165 + i * 4},${130 + i * 4} ${165 + i * 4 + 1},${134 + i * 4} ${35 - i * 4 - 1},${134 + i * 4}`}
          fill={c.secondary} stroke={c.stroke} strokeWidth={0.3} />
      ))}
      {/* Rostral prows */}
      {[65, 100, 135].map(px => (
        <g key={px}>
          <polygon points={`${px},108 ${px - 5},128 ${px + 5},128`} fill={c.accent} stroke={c.stroke} strokeWidth={0.4} />
          <line x1={px} y1={108} x2={px} y2={102} stroke={c.stroke} strokeWidth={0.5} />
        </g>
      ))}
      {/* Balustrade */}
      {[48, 62, 76, 90, 110, 124, 138, 152].map(cx => (
        <rect key={cx} x={cx - 1} y={78} width={2} height={12} fill={c.secondary} stroke={c.stroke} strokeWidth={0.2} rx={0.3} />
      ))}
      <line x1={46} y1={78} x2={154} y2={78} stroke={c.stroke} strokeWidth={0.5} />
    </g>
  );
}

// ─── Curia (Austere senate hall) ─────────────────────────
function Curia({ tier, id }: BuildingProps) {
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      <Wall tier={tier} x={48} y={130} width={104} height={75} prefix={id} />
      {/* Grand portal */}
      <Arch tier={tier} x={100} y={128} width={22} height={34} prefix={id} />
      {/* Minimal window */}
      <rect x={62} y={68} width={8} height={14} fill="none" stroke={TIER_FILLS[tier].stroke} strokeWidth={0.35} rx={1} opacity={0.5} />
      <rect x={132} y={68} width={8} height={14} fill="none" stroke={TIER_FILLS[tier].stroke} strokeWidth={0.35} rx={1} opacity={0.5} />
      <TriangularRoof tier={tier} x={100} y={53} width={115} prefix={id} />
      <Base tier={tier} x={100} y={132} width={125} prefix={id} />
    </g>
  );
}

// ─── Macellum (Circular tholos market) ───────────────────
function Macellum({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      {/* Low enclosure wall */}
      <ellipse cx={100} cy={125} rx={68} ry={14} fill="none" stroke={c.stroke} strokeWidth={0.4} />
      <ellipse cx={100} cy={125} rx={68} ry={14} fill={c.primary} opacity={0.15} />
      {/* Ring of columns */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (Math.PI / 9) * (i + 1);
        const cx = 100 - 55 * Math.cos(angle);
        return <Column key={i} tier={tier} x={cx} y={122} prefix={id} />;
      })}
      {/* Central tholos */}
      <Column tier={tier} x={100} y={122} prefix={id} />
      <DomeRoof tier={tier} x={100} y={60} width={28} prefix={id} />
      <Base tier={tier} x={100} y={132} width={145} prefix={id} />
    </g>
  );
}

// ─── Argentaria (Columned portico / Bank) ────────────────
function Argentaria({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      <Wall tier={tier} x={42} y={130} width={116} height={58} prefix={id} />
      {/* Deep colonnade */}
      {[54, 72, 90, 108, 126, 144].map(cx => (
        <Column key={cx} tier={tier} x={cx} y={130} prefix={id} />
      ))}
      {/* Strong horizontal cornice */}
      <rect x={38} y={69} width={124} height={3} fill={c.secondary} stroke={c.stroke} strokeWidth={0.5} />
      <TriangularRoof tier={tier} x={100} y={70} width={125} prefix={id} />
      <Base tier={tier} x={100} y={132} width={135} prefix={id} />
    </g>
  );
}

// ─── Templum (Grand temple) ─────────────────────────────
function Templum({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      {/* Cella */}
      <Wall tier={tier} x={38} y={130} width={124} height={65} prefix={id} />
      {/* Six columns with proper intercolumniation */}
      {[48, 64, 80, 120, 136, 152].map(cx => (
        <Column key={cx} tier={tier} x={cx} y={130} prefix={id} />
      ))}
      <TriangularRoof tier={tier} x={100} y={63} width={135} prefix={id} />
      {/* Wide stylobate steps */}
      {[0, 1, 2, 3, 4].map(i => (
        <polygon key={i}
          points={`${36 - i * 3},${132 + i * 3} ${164 + i * 3},${132 + i * 3} ${164 + i * 3 + 1},${135 + i * 3} ${36 - i * 3 - 1},${135 + i * 3}`}
          fill={c.secondary} stroke={c.stroke} strokeWidth={0.25} />
      ))}
    </g>
  );
}

// ─── Arcus (Triple-bay triumphal arch) ──────────────────
function Arcus({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      {/* Main body */}
      <rect x={48} y={48} width={104} height={82} fill={`url(#${id}tier-${tier})`} stroke={c.stroke} strokeWidth={0.5} />
      {/* Central large arch */}
      <Arch tier={tier} x={100} y={128} width={28} height={52} prefix={id} />
      {/* Flanking arches */}
      <Arch tier={tier} x={66} y={128} width={14} height={32} prefix={id} />
      <Arch tier={tier} x={134} y={128} width={14} height={32} prefix={id} />
      {/* Attic with inscription panel */}
      <rect x={46} y={43} width={108} height={12} fill={c.secondary} stroke={c.stroke} strokeWidth={0.45} />
      <rect x={70} y={45.5} width={60} height={7} fill="none" stroke={c.accent} strokeWidth={0.3} opacity={0.4} rx={0.5} />
      {/* Engaged columns */}
      {[56, 76, 124, 144].map(cx => (
        <Column key={cx} tier={tier} x={cx} y={130} prefix={id} />
      ))}
      <Base tier={tier} x={100} y={132} width={125} prefix={id} />
    </g>
  );
}

// ─── Insula (Multi-story apartment block) ────────────────
function Insula({ tier, id }: BuildingProps) {
  const c = TIER_FILLS[tier];
  return (
    <g>
      <TierGradientDefs tier={tier} prefix={id} />
      <Wall tier={tier} x={42} y={130} width={116} height={78} prefix={id} />
      {/* Three rows of windows */}
      {[0, 1, 2].map(row => (
        <g key={row}>
          {[62, 80, 98, 116, 134].map(wx => (
            <rect key={wx} x={wx} y={60 + row * 24} width={7} height={12}
              fill="none" stroke={c.stroke} strokeWidth={0.35}
              rx={tier === "wood" ? 0 : 1} opacity={0.55} />
          ))}
        </g>
      ))}
      {/* Arched ground-floor entrance */}
      <Arch tier={tier} x={100} y={128} width={14} height={22} prefix={id} />
      {/* Cornice lines between floors */}
      {[0, 1].map(i => (
        <line key={i} x1={42} y1={76 + i * 24} x2={158} y2={76 + i * 24}
          stroke={c.stroke} strokeWidth={0.3} opacity={0.3} />
      ))}
      <Base tier={tier} x={100} y={132} width={125} prefix={id} />
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

function slugify(t: string) { return t.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-") + "-"; }

export function MonumentSVG({ buildingType, tier, className }: MonumentSVGProps) {
  const BuildingComponent = BUILDING_MAP[buildingType] || Insula;
  const id = slugify(buildingType);
  return (
    <svg viewBox="0 0 200 160" className={className} style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMax meet">
      <BuildingComponent tier={tier} id={id} />
    </svg>
  );
}
