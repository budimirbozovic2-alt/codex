import { loadDisciplineLog } from "../planner-storage";
import { differenceInDays } from "date-fns";

export interface RecoveryStats {
  avgRecoveryDays: number;
  recoveryCount: number;
  fastRecoveries: number;
  slowRecoveries: number;
  recoveryIndex: number;
}

export function calcRecoveryRate(): RecoveryStats | null {
  const log = loadDisciplineLog();
  if (log.length < 5) return null;

  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const recoveries: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].status !== "lazy") continue;

    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].status === "diligent") {
        const lazyDate = new Date(sorted[i].date);
        const diligentDate = new Date(sorted[j].date);
        const days = differenceInDays(diligentDate, lazyDate);
        if (days > 0 && days <= 30) {
          recoveries.push(days);
        }
        break;
      }
    }
  }

  if (recoveries.length === 0) return null;

  const avg = recoveries.reduce((s, d) => s + d, 0) / recoveries.length;
  const fast = recoveries.filter(d => d <= 1).length;
  const slow = recoveries.filter(d => d >= 3).length;

  const index = Math.round(Math.max(0, Math.min(100, (1 - (avg - 1) / 6) * 100)));

  return {
    avgRecoveryDays: Math.round(avg * 10) / 10,
    recoveryCount: recoveries.length,
    fastRecoveries: fast,
    slowRecoveries: slow,
    recoveryIndex: index,
  };
}
