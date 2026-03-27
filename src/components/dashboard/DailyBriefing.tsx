import { Brain, Target, Lightbulb } from "lucide-react";
import { memo } from "react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
interface Props {
  briefText: string;
  timeRecMessage: string | null;
  todayReviews: number;
  dailyGoal: number;
  goalProgress: number;
  streak: number;
}

export const DailyBriefing = memo(function DailyBriefing({ briefText, timeRecMessage, todayReviews, dailyGoal, goalProgress, streak }: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className="rounded-xl bg-card border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Dnevni briefing</h3>
      </div>

      <p className="text-sm text-muted-foreground">{briefText}</p>

      {timeRecMessage && (
        <div className="flex items-center gap-2 text-xs">
          <Lightbulb className="h-3.5 w-3.5 text-primary" />
          <span className="text-primary font-medium">{timeRecMessage}</span>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Dnevni cilj</span>
          </div>
          <div className="flex items-center gap-3">
            {streak > 0 && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 border border-warning/20">
                <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="text-xs">🔥</motion.span>
                <span className="text-[10px] font-bold text-warning tabular-nums">{streak}d</span>
              </motion.div>
            )}
            <span className="text-xs font-medium tabular-nums">{todayReviews} / {dailyGoal}</span>
          </div>
        </div>
        <Progress value={goalProgress} className="h-2" />
        {goalProgress >= 100 && <p className="text-xs text-success font-medium">✓ Cilj ostvaren! 🎉</p>}
      </div>
    </motion.div>
  );
});
