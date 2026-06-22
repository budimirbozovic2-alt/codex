import { ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export interface StudyFlowData {
  focusSubject: string;
  focusCategoryId: string;
  dailyProgress: number;
  dailyQuota: number;
  learnPct: number;
  reviewPct: number;
  learnTarget: number;
  reviewTarget: number;
  ratioLabel: string;
  overallPct: number;
}

export function StudyFlowWidget({ data }: { data: StudyFlowData }) {
  const progressPct = data.dailyQuota > 0
    ? Math.min(100, Math.round((data.dailyProgress / data.dailyQuota) * 100))
    : 0;

  return (
    <div
      className="animate-fade-up glass-card p-5 h-full space-y-4"
      style={{ animationDelay: "100ms", animationFillMode: "both" }}
    >
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h3 className="text-eyebrow normal-case tracking-normal">Plan za danas</h3>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Fokus</p>
        <p className="text-sm font-semibold truncate">{data.focusSubject}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{data.dailyProgress}/{data.dailyQuota} sekcija</span>
          <span>{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Omjer: {data.learnPct}% učenje · {data.reviewPct}% ponavljanje</span>
      </div>
      <p className="text-xs text-muted-foreground/70">{data.ratioLabel}</p>

      <div className="pt-2 border-t border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-muted-foreground">
          Danas: {data.reviewTarget} ponavljanja + {data.learnTarget} novih
        </div>
        <div className="flex items-center gap-2">
          {data.reviewTarget > 0 && (
            <Button asChild size="sm" variant="outline" className="h-8 px-3 text-xs">
              <Link to="/review">Ponovi</Link>
            </Button>
          )}
          <Button asChild size="sm" className="h-8 px-3 text-xs">
            <Link to={`/learn?mode=strict-recall&category=${encodeURIComponent(data.focusCategoryId)}`}>
              Započni
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
