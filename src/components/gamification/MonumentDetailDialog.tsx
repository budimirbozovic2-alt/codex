import { memo, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCardContext } from "@/contexts/AppContext";
import { MATERIAL_ICONS } from "@/lib/forum-logic";
import type { Monument } from "@/lib/forum-logic";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { formatDistanceToNow, isPast } from "date-fns";

const STATE_LABELS: Record<number, { label: string; cls: string }> = {
  0: { label: "Novus", cls: "bg-muted text-muted-foreground" },
  1: { label: "Discens", cls: "bg-blue-500/20 text-blue-500" },
  2: { label: "Peritus", cls: "bg-green-500/20 text-green-500" },
  3: { label: "Rediscens", cls: "bg-orange-500/20 text-orange-500" },
};

interface Props {
  monument: Monument | null;
  open: boolean;
  onClose: () => void;
}

export const MonumentDetailDialog = memo(function MonumentDetailDialog({ monument, open, onClose }: Props) {
  const { cards } = useCardContext();

  const categoryCards = useMemo(() => {
    if (!monument) return [];
    const filtered = Object.values(cards).filter((c) => c.category === monument.category);

    return filtered
      .map((card) => {
        const sections = card.sections ?? [];
        const worstState = sections.length > 0
          ? Math.max(...sections.map((s) => s.state ?? 0))
          : 0;
        const stability = sections.length > 0
          ? Math.min(...sections.filter((s) => (s.stability ?? 0) > 0).map((s) => s.stability ?? 0)) || 0
          : 0;
        const lapses = sections.reduce((sum, s) => sum + (s.lapses ?? 0), 0);
        const isLeech = lapses >= 5;
        const allReview = sections.length > 0
          ? sections.every((s) => (s.state ?? 0) === 2)
          : false;
        const earliestReview = sections.length > 0
          ? Math.min(...sections.map((s) => s.nextReview ?? Infinity))
          : Infinity;
        const nextReview = earliestReview < Infinity ? new Date(earliestReview) : null;
        const overdue = nextReview ? isPast(nextReview) : false;

        return { card, worstState, stability, lapses, isLeech, allReview, nextReview, overdue };
      })
      .sort((a, b) => {
        if (a.isLeech !== b.isLeech) return a.isLeech ? -1 : 1;
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        const aTime = a.nextReview?.getTime() ?? Infinity;
        const bTime = b.nextReview?.getTime() ?? Infinity;
        return aTime - bTime;
      });
  }, [cards, monument]);

  if (!monument) return null;

  const materialIcon = MATERIAL_ICONS[monument.material];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3">
            <span className="text-xl">{materialIcon}</span>
            <span className="font-display text-gold">{monument.category}</span>
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {monument.masteredCards}/{monument.totalCards} cives · {monument.mastery}%
            </span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6 py-4">
          {categoryCards.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-8 text-center">Nulla carta in hac disciplina.</p>
          ) : (
            <div className="space-y-2">
              {categoryCards.map(({ card, worstState, stability, isLeech, allReview, nextReview, overdue }) => {
                const stateInfo = STATE_LABELS[worstState] ?? STATE_LABELS[0];
                const question = (card.question ?? "").replace(/<[^>]*>/g, "").slice(0, 80);

                return (
                  <div
                    key={card.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      allReview
                        ? "border-gold/30 bg-gold/5"
                        : isLeech
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border/50 bg-background/50"
                    }`}
                  >
                    {/* Status indicators */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {allReview && <CheckCircle2 className="h-3.5 w-3.5 text-gold" />}
                      {isLeech && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                    </div>

                    {/* Question text */}
                    <span className="flex-1 truncate text-foreground">
                      {question || "—"}
                    </span>

                    {/* State badge */}
                    <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${stateInfo.cls} border-0`}>
                      {stateInfo.label}
                    </Badge>

                    {/* Stability */}
                    {stability > 0 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-12 text-right">
                        S̄ {stability.toFixed(0)}d
                      </span>
                    )}

                    {/* Next review */}
                    {nextReview && (
                      <span className={`text-[10px] tabular-nums shrink-0 w-20 text-right ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                        {overdue ? "kasni " : "za "}
                        {formatDistanceToNow(nextReview, { addSuffix: false })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
});
