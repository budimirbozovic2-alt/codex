import { useEffect } from "react";
import { recordFirstAction, addActivityEntry } from "@/lib/metacognitive-storage";
import { VIEW_ACTIVITY_MAP, type View } from "../routing/useCurrentView";

export function useActivityTracker(view: View) {
  useEffect(() => {
    if (view === "review" || view === "learn") recordFirstAction();
  }, [view]);

  useEffect(() => {
    const actType = VIEW_ACTIVITY_MAP[view];
    if (!actType) return;
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      if (duration > 5000) {
        addActivityEntry({ timestamp: start, type: actType, durationMs: duration });
      }
    };
  }, [view]);
}
