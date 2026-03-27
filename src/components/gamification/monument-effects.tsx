/**
 * Blueprint-style SVG overlay effects for Forum monuments.
 * Phase-synced: foundation/skeleton = none, construction = scaffolding,
 * complete = torches, imperial = torches + fountain + golden glow.
 * Cracks and ivy use gold-tinted lines.
 */
import type { Monument, ConstructionPhase } from "@/lib/forum-logic";

function slugify(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
}

interface Props {
  monument: Monument;
}

// ─── Cracks (leech ratio > 0.2) — crisp gold fault lines ─

function CrackOverlay({ leechRatio }: { leechRatio: number }) {
  const opacity = Math.min(0.7, leechRatio * 1.8);
  const stroke = "hsl(45,40%,35%)";
  return (
    <g opacity={opacity}>
      <path d="M62,130 Q64,118 60,108 Q63,100 58,92 Q61,86 59,80"
        fill="none" stroke={stroke} strokeWidth={0.5} strokeLinecap="round" />
      <path d="M138,130 Q136,115 140,105 Q137,96 141,88"
        fill="none" stroke={stroke} strokeWidth={0.45} strokeLinecap="round" />
      <path d="M92,130 Q90,122 93,112 Q88,104 91,95"
        fill="none" stroke={stroke} strokeWidth={0.4} strokeLinecap="round" />
    </g>
  );
}

// ─── Ivy (stability < 10) — gold-tinted vine lines ──────

function IvyOverlay({ stability }: { stability: number }) {
  const opacity = Math.max(0.15, Math.min(0.5, (10 - stability) / 12));
  const stroke = "hsl(45,30%,30%)";
  const leaf = "hsl(45,35%,35%)";
  return (
    <g opacity={opacity}>
      <path d="M36,130 C38,120 40,115 42,108 C40,105 42,98 44,92 C42,88 44,82 46,78"
        fill="none" stroke={stroke} strokeWidth={0.7} strokeLinecap="round" />
      <ellipse cx={43} cy={95} rx={2} ry={1.5} fill="none" stroke={leaf} strokeWidth={0.3} opacity={0.5} />
      <ellipse cx={41} cy={110} rx={1.5} ry={1.2} fill="none" stroke={leaf} strokeWidth={0.3} opacity={0.4} />
      <path d="M162,130 C160,122 163,115 161,108 C163,102 160,96 163,90"
        fill="none" stroke={stroke} strokeWidth={0.6} strokeLinecap="round" />
      <ellipse cx={161} cy={106} rx={1.5} ry={1.2} fill="none" stroke={leaf} strokeWidth={0.3} opacity={0.4} />
    </g>
  );
}

// ─── Scaffolding overlay (construction phase) ────────────

function ScaffoldingEffect() {
  const stroke = "hsl(45,50%,40%)";
  return (
    <g opacity={0.2}>
      {/* Diagonal cross-bracing across the building */}
      <line x1={50} y1={130} x2={70} y2={80} stroke={stroke} strokeWidth={0.3} />
      <line x1={70} y1={130} x2={50} y2={80} stroke={stroke} strokeWidth={0.3} />
      <line x1={130} y1={130} x2={150} y2={80} stroke={stroke} strokeWidth={0.3} />
      <line x1={150} y1={130} x2={130} y2={80} stroke={stroke} strokeWidth={0.3} />
      {/* Horizontal planks */}
      <line x1={45} y1={105} x2={155} y2={105} stroke={stroke} strokeWidth={0.25} strokeDasharray="4,3" />
    </g>
  );
}

// ─── Torches (complete/imperial) ─────────────────────────

function TorchOverlay({ phase, id }: { phase: ConstructionPhase; id: string }) {
  const count = phase === "imperial" ? 4 : 2;
  const positions = [
    { x: 55, y: 82 },
    { x: 145, y: 82 },
    { x: 75, y: 72 },
    { x: 125, y: 72 },
  ].slice(0, count);

  return (
    <g>
      <defs>
        <radialGradient id={`tg-${id}`}>
          <stop offset="0%" stopColor="hsl(45,85%,55%)" stopOpacity={0.3} />
          <stop offset="60%" stopColor="hsl(45,85%,55%)" stopOpacity={0.06} />
          <stop offset="100%" stopColor="hsl(45,85%,55%)" stopOpacity={0} />
        </radialGradient>
      </defs>
      {positions.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={6} fill={`url(#tg-${id})`} />
          <circle cx={p.x} cy={p.y} r={1.2} fill="hsl(45,90%,55%)" opacity={0.7}>
            <animate attributeName="opacity" values="0.5;0.8;0.5" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="r" values="1;1.5;1" dur="2.2s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </g>
  );
}

// ─── Fountain (imperial only) ────────────────────────────

function FountainOverlay() {
  const stroke = "hsl(45,60%,50%)";
  return (
    <g opacity={0.6}>
      <ellipse cx={100} cy={148} rx={10} ry={2.5} fill="none" stroke={stroke} strokeWidth={0.4} />
      <circle cx={100} cy={143} r={0.8} fill={stroke} opacity={0.5}>
        <animate attributeName="cy" values="141;145;141" dur="1.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0.15;0.6" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <circle cx={97.5} cy={144} r={0.5} fill={stroke} opacity={0.3}>
        <animate attributeName="cy" values="142;146;142" dur="1.7s" repeatCount="indefinite" />
      </circle>
      <circle cx={102.5} cy={144} r={0.5} fill={stroke} opacity={0.3}>
        <animate attributeName="cy" values="143;147;143" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// ─── Golden Glow (imperial) ──────────────────────────────

function GoldenGlowOverlay() {
  return (
    <g>
      <defs>
        <radialGradient id="imperial-ambient-glow" cx="0.5" cy="0.5" rx="0.4" ry="0.4">
          <stop offset="0%" stopColor="hsl(45,90%,55%)" stopOpacity={0.08} />
          <stop offset="100%" stopColor="hsl(45,90%,55%)" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={20} y={20} width={160} height={120} fill="url(#imperial-ambient-glow)" />
    </g>
  );
}

// ─── Main Component ─────────────────────────────────────

export function MonumentEffects({ monument }: Props) {
  const phase = monument.material;
  const leechRatio = monument.totalCards > 0
    ? monument.leechCount / Math.max(1, monument.totalCards)
    : 0;

  const id = slugify(monument.category);

  return (
    <svg viewBox="0 0 200 160" className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMax meet">
      {/* Phase-based effects */}
      {(phase === "skeleton" || phase === "construction") && <ScaffoldingEffect />}
      {(phase === "complete" || phase === "imperial") && <TorchOverlay phase={phase} id={id} />}
      {phase === "imperial" && <FountainOverlay />}
      {phase === "imperial" && <GoldenGlowOverlay />}

      {/* Decay effects (independent of phase) */}
      {monument.crumbling && <CrackOverlay leechRatio={leechRatio} />}
      {monument.avgStability < 10 && <IvyOverlay stability={monument.avgStability} />}
    </svg>
  );
}
