import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { SubjectPlan } from "@/types/planner";
import { PHASE_COLORS } from "./planner-constants";

interface Props {
  plan: SubjectPlan;
  index: number;
  onNavigate?: (categoryId: string) => void;
}

export default function SubjectCard({ plan, index, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const color = PHASE_COLORS[index % PHASE_COLORS.length];

  return (
    <div className="rounded-lg border bg-secondary/30 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors text-left"
      >
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{plan.categoryName}</span>
            {plan.weight > 1 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">Težak</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {plan.allocatedDays}d • {format(plan.startDate, "dd.MM")} — {format(plan.endDate, "dd.MM")}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-medium tabular-nums">{plan.pct}%</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{plan.learnedSections}/{plan.totalSections}</p>
        </div>
      </button>

      {/* Progress bar */}
      <div className="px-3 pb-2">
        <Progress value={plan.pct} className="h-1.5" />
      </div>

      {/* Expanded units */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t pt-2">
          {plan.units.map(unit => (
            <div key={unit.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate">{unit.name}</span>
                <span className="text-muted-foreground tabular-nums flex-shrink-0 ml-2">{unit.learnedSections}/{unit.totalSections}</span>
              </div>
              <Progress value={unit.pct} className="h-1" />
            </div>
          ))}
          {onNavigate && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(plan.categoryId); }}
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
            >
              <ExternalLink className="h-3 w-3" /> Otvori u bazi
            </button>
          )}
        </div>
      )}
    </div>
  );
}
