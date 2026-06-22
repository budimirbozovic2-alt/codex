import type { ErrorLogEntry, ErrorStatus } from "./types";

/** Pure error-status classifier — safe for Web Workers (no editor/DOM deps). */
export function getErrorStatus(entry: ErrorLogEntry): ErrorStatus {
  if (entry.successStreak >= 5) return "mastered";
  if (entry.recentSuccesses > entry.count) return "recovering";
  return "critical";
}
