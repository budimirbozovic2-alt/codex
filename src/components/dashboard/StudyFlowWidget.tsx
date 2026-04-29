import { ClipboardList } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export interface StudyFlowData {
  focusSubject: string;
  dailyMapped: number;
  dailyQuota: number;
  learnPct: number;
  reviewPct: number;
  ratioLabel: string;
  overallPct: number;
}

export function StudyFlowWidget({ data }: { data: StudyFlowData }) {
  const progressPct = data.dailyQuota > 0 ? Math.min(100, Math.round((data.dailyMapped / data.dailyQuota) * 100)) : 0;

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-4 duration-300 glass-card p-5 space-y-4"
      style={{ animationDelay: "100ms", animationFillMode: "both" }}
    >
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Plan za danas</h3>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Fokus</p>
        <p className="text-sm font-semibold truncate">{data.focusSubject}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{data.dailyMapped}/{data.dailyQuota} sekcija</span>
          <span>{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Omjer: {data.learnPct}% učenje · {data.reviewPct}% ponavljanje</span>
      </div>
      <p className="text-xs text-muted-foreground/70">{data.ratioLabel}</p>
    </div>
  );
}
