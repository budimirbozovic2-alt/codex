import { Gauge } from "lucide-react";
import { memo } from "react";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n/useT";

interface FocusRatio {
  progress: number;
  targetReviewPct: number;
  targetNewPct: number;
}

interface ActualRatio {
  actualReviewPct: number;
  actualNewPct: number;
  totalToday: number;
  reviewCount: number;
  newCount: number;
}

interface Props {
  focusRatio: FocusRatio;
  actualRatio: ActualRatio;
  autoSuggestion: { reviewTarget: number; newTarget: number } | null;
  dailyGoal: number;
}

export const IdealFocus = memo(function IdealFocus({ focusRatio, actualRatio, autoSuggestion, dailyGoal }: Props) {
  const t = useT();
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
      className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">{t("dashboard.idealFocus")}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{t("dashboard.progress", { pct: focusRatio.progress })}</span>
      </div>

      <div className="space-y-2">
        <div className="flex h-6 rounded-lg overflow-hidden bg-secondary">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${focusRatio.targetReviewPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="bg-primary flex items-center justify-center"
          >
            {focusRatio.targetReviewPct >= 15 && (
              <span className="text-[10px] font-bold text-primary-foreground">{t("dashboard.reviewPct", { pct: focusRatio.targetReviewPct })}</span>
            )}
          </motion.div>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${focusRatio.targetNewPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
            className="bg-success flex items-center justify-center"
          >
            {focusRatio.targetNewPct >= 15 && (
              <span className="text-[10px] font-bold text-success-foreground">{t("dashboard.newPct", { pct: focusRatio.targetNewPct })}</span>
            )}
          </motion.div>
        </div>

        {actualRatio.totalToday > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("dashboard.actualRatioToday")}</span>
              <span className="tabular-nums">{actualRatio.reviewCount} pon. / {actualRatio.newCount} novo</span>
            </div>
            <div className="flex h-3 rounded-md overflow-hidden bg-secondary">
              <div className="bg-primary/60 transition-all" style={{ width: `${actualRatio.actualReviewPct}%` }} />
              <div className="bg-success/60 transition-all" style={{ width: `${actualRatio.actualNewPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {autoSuggestion && (
        <p className="text-xs text-muted-foreground">
          {t("dashboard.recommendedGoal", { reviewTarget: autoSuggestion.reviewTarget, newTarget: autoSuggestion.newTarget, dailyGoal })}
        </p>
      )}
    </motion.div>
  );
});
