import { m } from "framer-motion";
import { useId } from "react";
import { useCountUp } from "@/hooks/useCountUp";

interface Props {
  /** 0-100 */
  percent: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
  colorClass?: string;
}

export default function ProgressRing({
  percent,
  size = 90,
  strokeWidth = 7,
  label,
  sublabel,
  colorClass = "text-primary",
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (safe / 100) * circumference;
  const gid = useId().replace(/:/g, "");
  const display = useCountUp(Math.round(safe), { duration: 700 });

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className={`-rotate-90 ${colorClass}`}
          style={{ filter: "drop-shadow(0 2px 6px hsl(var(--foreground) / 0.10))" }}
        >
          <defs>
            <linearGradient id={`pr-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--surface-2))"
            strokeWidth={strokeWidth}
          />
          <m.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#pr-${gid})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-display text-lg font-semibold tabular leading-none">{display}%</span>
        </div>
      </div>
      <p className="text-xs font-medium text-center leading-tight text-pretty">{label}</p>
      {sublabel && <p className="text-[10px] text-muted-foreground text-center tabular">{sublabel}</p>}
    </div>
  );
}
