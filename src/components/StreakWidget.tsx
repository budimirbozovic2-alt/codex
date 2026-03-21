import { useMemo } from "react";
import { ReviewLogEntry } from "@/lib/storage";
import { default as Flame } from "lucide-react/dist/esm/icons/flame";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { Progress } from "@/components/ui/progress";

interface Props {
  reviewLog: ReviewLogEntry[];
  dailyGoal: number;
}

function getDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StreakWidget({ reviewLog, dailyGoal }: Props) {
  const { streak, todayCount, todayProgress } = useMemo(() => {
    const today = getDayKey(Date.now());

    // Count today's reviews
    const todayCount = reviewLog.filter((e) => getDayKey(e.timestamp) === today).length;
    const todayProgress = Math.min(100, Math.round((todayCount / Math.max(1, dailyGoal)) * 100));

    // Calculate streak
    const reviewDays = new Set(reviewLog.map((e) => getDayKey(e.timestamp)));
    let streak = 0;
    const cursor = new Date();

    // Check if today has reviews; if not, start checking from yesterday
    if (!reviewDays.has(getDayKey(cursor.getTime()))) {
      cursor.setDate(cursor.getDate() - 1);
      if (!reviewDays.has(getDayKey(cursor.getTime()))) {
        return { streak: 0, todayCount, todayProgress };
      }
    }

    while (reviewDays.has(getDayKey(cursor.getTime()))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return { streak, todayCount, todayProgress };
  }, [reviewLog, dailyGoal]);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Dnevni cilj</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Flame className={`h-5 w-5 ${streak > 0 ? "text-primary" : "text-muted-foreground"}`} />
          <span className={`text-lg font-bold ${streak > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {streak}
          </span>
          <span className="text-xs text-muted-foreground">
            {streak === 1 ? "dan" : streak >= 2 && streak <= 4 ? "dana" : "dana"}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{todayCount} / {dailyGoal} ponavljanja</span>
          <span className="font-medium">{todayProgress}%</span>
        </div>
        <Progress value={todayProgress} className="h-2" />
      </div>

      {todayCount >= dailyGoal && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          ✓ Dnevni cilj ispunjen!
        </p>
      )}
    </div>
  );
}
