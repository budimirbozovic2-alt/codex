/**
 * Dynamic SVG overlay effects for Roman Forum monuments.
 * Renders cracks, ivy, torches, scaffolding, and fountains based on monument stats.
 */
import type { Monument } from "@/lib/forum-logic";

interface Props {
  monument: Monument;
}

function CrackOverlay({ leechRatio }: { leechRatio: number }) {
  const opacity = Math.min(0.8, leechRatio * 2);
  return (
    <g opacity={opacity}>
      <path d="M60,130 L65,110 L58,95 L63,80" fill="none" stroke="hsl(0,0%,25%)" strokeWidth={0.8} />
      <path d="M140,130 L135,105 L142,88" fill="none" stroke="hsl(0,0%,25%)" strokeWidth={0.7} />
      <path d="M90,130 L88,118 L95,100 L87,85" fill="none" stroke="hsl(0,0%,30%)" strokeWidth={0.6} />
    </g>
  );
}

function IvyOverlay({ stability }: { stability: number }) {
  // More ivy when stability is lower (grows when neglected)
  const opacity = Math.max(0.2, Math.min(0.8, (10 - stability) / 10));
  return (
    <g opacity={opacity}>
      <path d="M35,130 Q38,115 42,110 Q40,105 44,95 Q41,88 46,80" fill="none" stroke="hsl(120,40%,30%)" strokeWidth={1.2} />
      <circle cx={44} cy={95} r={2.5} fill="hsl(120,45%,35%)" opacity={0.6} />
      <circle cx={42} cy={108} r={2} fill="hsl(120,45%,35%)" opacity={0.5} />
      <path d="M160,130 Q158,118 162,108 Q159,100 163,90" fill="none" stroke="hsl(120,40%,30%)" strokeWidth={1} />
      <circle cx={162} cy={105} r={2} fill="hsl(120,45%,35%)" opacity={0.5} />
    </g>
  );
}

function TorchOverlay({ mastery, tier, id }: { mastery: number; tier: string; id: string }) {
  const count = tier === "gold" ? 4 : tier === "marble" ? 3 : tier === "stone" ? 2 : 1;
  const positions = [
    { x: 55, y: 80 },
    { x: 145, y: 80 },
    { x: 75, y: 70 },
    { x: 125, y: 70 },
  ].slice(0, count);

  return (
    <g>
      <defs>
        <radialGradient id={`torch-glow-${id}`}>
          <stop offset="0%" stopColor="hsl(45,90%,60%)" stopOpacity={0.6} />
          <stop offset="100%" stopColor="hsl(45,90%,60%)" stopOpacity={0} />
        </radialGradient>
      </defs>
      {positions.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={8} fill={`url(#torch-glow-${id})`} />
          <circle cx={p.x} cy={p.y} r={2} fill="hsl(35,100%,55%)" opacity={0.9}>
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="r" values="1.5;2.5;1.5" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </g>
  );
}

function ScaffoldingOverlay() {
  return (
    <g opacity={0.5}>
      {/* Vertical beams */}
      <line x1={45} y1={130} x2={45} y2={55} stroke="hsl(30,50%,35%)" strokeWidth={1.5} />
      <line x1={155} y1={130} x2={155} y2={55} stroke="hsl(30,50%,35%)" strokeWidth={1.5} />
      {/* Horizontal beams */}
      <line x1={43} y1={90} x2={157} y2={90} stroke="hsl(30,50%,35%)" strokeWidth={1} />
      <line x1={43} y1={110} x2={157} y2={110} stroke="hsl(30,50%,35%)" strokeWidth={1} />
      {/* Cross bracing */}
      <line x1={45} y1={90} x2={155} y2={110} stroke="hsl(30,40%,40%)" strokeWidth={0.7} />
      <line x1={155} y1={90} x2={45} y2={110} stroke="hsl(30,40%,40%)" strokeWidth={0.7} />
    </g>
  );
}

function FountainOverlay() {
  return (
    <g>
      {/* Water basin */}
      <ellipse cx={100} cy={148} rx={12} ry={3} fill="none" stroke="hsl(210,60%,60%)" strokeWidth={0.5} />
      {/* Droplets */}
      <circle cx={100} cy={142} r={1.2} fill="hsl(210,70%,65%)" opacity={0.7}>
        <animate attributeName="cy" values="140;145;140" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx={97} cy={143} r={0.8} fill="hsl(210,70%,65%)" opacity={0.5}>
        <animate attributeName="cy" values="141;146;141" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx={103} cy={143} r={0.8} fill="hsl(210,70%,65%)" opacity={0.5}>
        <animate attributeName="cy" values="142;147;142" dur="1.3s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

export function MonumentEffects({ monument }: Props) {
  const leechRatio = monument.totalCards > 0
    ? monument.leechCount / Math.max(1, monument.totalCards)
    : 0;

  return (
    <svg viewBox="0 0 200 160" className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMax meet">
      {monument.crumbling && <CrackOverlay leechRatio={leechRatio} />}
      {monument.avgStability < 10 && <IvyOverlay stability={monument.avgStability} />}
      {monument.mastery > 30 && <TorchOverlay mastery={monument.mastery} tier={monument.material} />}
      {monument.material === "wood" && <ScaffoldingOverlay />}
      {monument.avgStability > 30 && monument.mastery > 60 && <FountainOverlay />}
    </svg>
  );
}
