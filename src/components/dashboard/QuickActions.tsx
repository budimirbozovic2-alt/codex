import { RotateCcw } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";
interface Props {
  dueCount: number;
  hasCards: boolean;
}

export const QuickActions = memo(function QuickActions({ dueCount, hasCards }: Props) {
  if (!hasCards || dueCount === 0) return null;

  return (
    <div className="animate-fade-up glass-card rounded-xl p-4 flex items-center gap-3 flex-wrap"
      style={{ animationDelay: "40ms", animationFillMode: "both" }}>
      <Link to="/review"
        className="hover-lift pressable flex items-center gap-2 px-4 py-2.5 rounded-lg border border-hairline bg-background/80 text-sm font-medium shadow-soft w-full sm:w-auto justify-center">
        <RotateCcw className="h-4 w-4 text-warning" strokeWidth={1.6} />
        Ponovi dospjele <span className="tabular text-muted-foreground">({dueCount})</span>
      </Link>
    </div>
  );
});