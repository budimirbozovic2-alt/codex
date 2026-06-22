import { memo } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Card } from "@/lib/spaced-repetition";
import { MASTERY_LEVELS } from "@/lib/mastery";
import {
  ENDANGERED_CONCEPT_LABEL,
  ENDANGERED_CONCEPT_SHORT,
  shouldShowMasteredBadge,
  isEndangeredEssay,
  endangeredEssayTooltip,
} from "@/lib/saga/endangered-display";
import { cn } from "@/lib/utils";

interface Props {
  card: Card;
  /** Full spec label vs compact row label. */
  variant?: "full" | "compact";
  className?: string;
}

function CardMasteryStatusBadgeImpl({
  card,
  variant = "compact",
  className,
}: Props) {
  if (isEndangeredEssay(card)) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] border-warning/50 text-warning bg-warning/10 gap-1",
          className,
        )}
        title={endangeredEssayTooltip(card)}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {variant === "full" ? ENDANGERED_CONCEPT_LABEL : ENDANGERED_CONCEPT_SHORT}
      </Badge>
    );
  }

  if (!shouldShowMasteredBadge(card)) return null;

  const mastered = MASTERY_LEVELS[5];
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10",
        className,
      )}
      style={{ borderColor: `${mastered.color}66`, color: mastered.color }}
      title={mastered.label}
    >
      <Sparkles className="h-3 w-3 shrink-0" />
      {mastered.label}
    </Badge>
  );
}

export const CardMasteryStatusBadge = memo(CardMasteryStatusBadgeImpl);

/** Aggregate badge for sidebars / dashboard rows (count of endangered essays). */
export const EndangeredCountBadge = memo(function EndangeredCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px] h-4 min-w-[16px] px-1 shrink-0 border-warning/50 text-warning bg-warning/10 gap-0.5",
        className,
      )}
      title={ENDANGERED_CONCEPT_LABEL}
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      {count}
    </Badge>
  );
});
