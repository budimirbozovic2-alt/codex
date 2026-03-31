import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Props for the CoverageStatsBar component.
 */
interface Props {
  /** The coverage percentage (0-100) */
  percent: number;
  /** Number of cards linked to the source */
  linkedCount: number;
}

/**
 * Visual indicator of how much of the source is covered by cards.
 */
export function CoverageStatsBar({ percent, linkedCount }: Props) {
  const barColor = percent >= 80 ? "bg-success" : percent >= 50 ? "bg-warning" : "bg-destructive";
  const color = percent >= 80 ? "text-success" : percent >= 50 ? "text-warning" : "text-destructive";
  
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
      <BarChart3 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <span className={cn("text-sm font-bold tabular-nums", color)}>{percent}%</span>
      <span className="text-xs text-muted-foreground">{linkedCount} kartica</span>
    </div>
  );
}
