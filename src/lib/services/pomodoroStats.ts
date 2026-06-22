import type { PomodoroLogEntry } from "@/lib/types/logs";
import {
  addPomodoroLogEntry,
  countPomodoroLogByType,
  loadPomodoroLogSince,
} from "@/lib/db/queries";

export type { PomodoroLogEntry };

export interface PomodoroStatsResult {
  today: number;
  todayMinutes: number;
  week: number;
  weekMinutes: number;
  total: number;
}

export async function addPomodoroEntry(entry: PomodoroLogEntry): Promise<void> {
  await addPomodoroLogEntry(entry);
}

export async function getPomodoroStats(): Promise<PomodoroStatsResult> {
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = todayStart - new Date().getDay() * 86400000;

  const [log, total] = await Promise.all([
    loadPomodoroLogSince(weekStart),
    countPomodoroLogByType("focus"),
  ]);

  let todayCount = 0;
  let todayMinutes = 0;
  let weekCount = 0;
  let weekMinutes = 0;
  for (const e of log) {
    if (e.type !== "focus") continue;
    weekCount++;
    weekMinutes += e.durationMinutes;
    if (e.timestamp >= todayStart) {
      todayCount++;
      todayMinutes += e.durationMinutes;
    }
  }

  return {
    today: todayCount,
    todayMinutes,
    week: weekCount,
    weekMinutes,
    total,
  };
}
