/**
 * Refined SVG overlay effects for Roman Forum monuments.
 * Organic cracks, bezier ivy, soft torch glow, clean fountain.
 */
import type { Monument } from "@/lib/forum-logic";

function slugify(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
}

interface Props {
  monument: Monument;
}

function CrackOverlay({ leechRatio }: { leechRatio: number }) {
  const opacity = Math.min(0.6, leechRatio * 1.5);
  return (
    <g opacity={opacity}>
      <path d="M62,130 Q64,118 60,108 Q63,100 58,92 Q61,86 59,80"
        fill="none" stroke="hsl(0,0%,30%)" strokeWidth={0.5} strokeLinecap="round" />
      <path d="M138,130 Q136,115 140,105 Q137,96 141,88"
        fill="none" stroke="hsl(0,0%,28%)" strokeWidth={0.45} strokeLinecap="round" />
      <path d="M92,130 Q90,122 93,112 Q88,104 91,95"
        fill="none" stroke="hsl(0,0%,32%)" strokeWidth={0.4} strokeLinecap="round" />
    </g>
  );
}

function IvyOverlay({ stability }: { stability: number }) {
  const opacity = Math.max(0.15, Math.min(0.6, (10 - stability) / 12));
  return (
    <g opacity={opacity}>
      {/* Left vine */}
      <path d="M36,130 C38,120 40,115 42,108 C40,105 42,98 44,92 C42,88 44,82 46,78"
        fill="none" stroke="hsl(120,35%,28%)" strokeWidth={0.8} strokeLinecap="round" />
      <ellipse cx={43} cy={95} rx={2} ry={1.5} fill="hsl(120,40%,32%)" opacity={0.5} />
      <ellipse cx={41} cy={110} rx={1.5} ry={1.2} fill="hsl(120,40%,32%)" opacity={0.4} />
      {/* Right vine */}
      <path d="M162,130 C160,122 163,115 161,108 C163,102 160,96 163,90"
        fill="none" stroke="hsl(120,35%,28%)" strokeWidth={0.7} strokeLinecap="round" />
      <ellipse cx={161} cy={106} rx={1.5} ry={1.2} fill="hsl(120,40%,32%)" opacity={0.4} />
    </g>
  );
}

function TorchOverlay({ tier, id }: { mastery: number; tier: string; id: string }) {
  const count = tier === "gold" ? 4 : tier === "marble" ? 3 : tier === "stone" ? 2 : 1;
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
          <stop offset="0%" stopColor="hsl(42,85%,58%)" stopOpacity={0.35} />
          <stop offset="60%" stopColor="hsl(42,85%,58%)" stopOpacity={0.08} />
          <stop offset="100%" stopColor="hsl(42,85%,58%)" stopOpacity={0} />
        </radialGradient>
      </defs>
      {positions.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={6} fill={`url(#tg-${id})`} />
          <circle cx={p.x} cy={p.y} r={1.2} fill="hsl(38,95%,55%)" opacity={0.8}>
            <animate attributeName="opacity" values="0.6;0.9;0.6" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="r" values="1;1.5;1" dur="2.2s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </g>
  );
}

function FountainOverlay() {
  return (
    <g opacity={0.7}>
      <ellipse cx={100} cy={148} rx={10} ry={2.5} fill="none" stroke="hsl(210,50%,55%)" strokeWidth={0.4} />
      <circle cx={100} cy={143} r={0.8} fill="hsl(210,60%,60%)" opacity={0.6}>
        <animate attributeName="cy" values="141;145;141" dur="1.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <circle cx={97.5} cy={144} r={0.5} fill="hsl(210,60%,60%)" opacity={0.4}>
        <animate attributeName="cy" values="142;146;142" dur="1.7s" repeatCount="indefinite" />
      </circle>
      <circle cx={102.5} cy={144} r={0.5} fill="hsl(210,60%,60%)" opacity={0.4}>
        <animate attributeName="cy" values="143;147;143" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

export function MonumentEffects({ monument }: Props) {
  const leechRatio = monument.totalCards > 0
    ? monument.leechCount / Math.max(1, monument.totalCards)
    : 0;

  // "Under construction" opacity for wood tier (replaces scaffolding)
  const isUnderConstruction = monument.material === "wood";

  return (
    <svg viewBox="0 0 200 160" className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMax meet">
      {isUnderConstruction && (
        <rect x={0} y={0} width={200} height={160} fill="hsl(0,0%,50%)" opacity={0.06} />
      )}
      {monument.crumbling && <CrackOverlay leechRatio={leechRatio} />}
      {monument.avgStability < 10 && <IvyOverlay stability={monument.avgStability} />}
      {monument.mastery > 30 && (
        <TorchOverlay mastery={monument.mastery} tier={monument.material} id={slugify(monument.category)} />
      )}
      {monument.avgStability > 30 && monument.mastery > 60 && <FountainOverlay />}
    </svg>
  );
}
