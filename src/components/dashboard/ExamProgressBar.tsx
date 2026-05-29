import { Trophy } from "lucide-react";
import { memo } from "react";
import { Progress } from "@/components/ui/progress";
import { useCountUp } from "@/hooks/useCountUp";
interface Props {
  learnedSections: number;
  totalSections: number;
  statusMessage: string | null;
  statusColor: string;
}

export const ExamProgressBar = memo(function ExamProgressBar({ learnedSections, totalSections, statusMessage, statusColor }: Props) {
  const pct = totalSections > 0 ? Math.round((learnedSections / totalSections) * 100) : 0;
  const learnedAnim = useCountUp(learnedSections, { duration: 700 });
  const pctAnim = useCountUp(pct, { duration: 800 });

  return (
    <div className="animate-fade-up glass-card p-5 space-y-3"
      style={{ animationFillMode: "both" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" strokeWidth={1.6} />
          <h3 className="text-eyebrow">Napredak do cilja</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium tabular">{learnedAnim} / {totalSections}</span>
          {statusMessage && (
            <span className={`text-xs font-medium ${statusColor}`}>{statusMessage}</span>
          )}
        </div>
      </div>
      <Progress value={pct} className="h-3" />
      <p className="text-xs text-muted-foreground tabular">{pctAnim}% savladano</p>
    </div>
  );
});
