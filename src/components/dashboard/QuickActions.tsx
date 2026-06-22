import { BookOpen, RotateCcw } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Props {
  dueCount: number;
  hasCards: boolean;
}

export const QuickActions = memo(function QuickActions({ dueCount, hasCards }: Props) {
  if (!hasCards) return null;

  if (dueCount === 0) {
    return (
      <div className="animate-fade-up space-y-1.5" style={{ animationDelay: "40ms", animationFillMode: "both" }}>
        <Button asChild className="w-full gap-2">
          <Link to="/learn">
            <BookOpen className="h-4 w-4" strokeWidth={1.6} />
            Nastavi učenje
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground text-center px-1">
          Nema dospjelih kartica za review
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up" style={{ animationDelay: "40ms", animationFillMode: "both" }}>
      <Button asChild className="w-full gap-2">
        <Link to="/review">
          <RotateCcw className="h-4 w-4" strokeWidth={1.6} />
          Ponovi dospjele
          <span className="tabular opacity-80">({dueCount})</span>
        </Link>
      </Button>
    </div>
  );
});
