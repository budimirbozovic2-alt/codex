import { useCallback, useRef } from "react";
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { buildSessionDisciplinePayload, sectionReviewKey } from "@/domains/planner/session-discipline";
import { usePlannerMutations } from "@/hooks/planner/usePlannerMutations";
import { logger } from "@/lib/logger";

const MIN_SESSION_MS = 5000;

interface RecordOpts {
  reviewLog: ReviewLogEntry[];
  cards: Card[];
  elapsedMs: number;
}

export function useSessionDiscipline() {
  const { recordDiscipline } = usePlannerMutations();
  const sessionKeysRef = useRef(new Set<string>());
  const recordedRef = useRef(false);

  const trackSection = useCallback((cardId: string, sectionId: string) => {
    sessionKeysRef.current.add(sectionReviewKey(cardId, sectionId));
  }, []);

  const resetSession = useCallback(() => {
    sessionKeysRef.current.clear();
    recordedRef.current = false;
  }, []);

  const recordAfterSession = useCallback(({ reviewLog, cards, elapsedMs }: RecordOpts) => {
    if (recordedRef.current) return;
    const worked = sessionKeysRef.current.size > 0;
    if (!worked && elapsedMs < MIN_SESSION_MS) return;
    recordedRef.current = true;

    const payload = buildSessionDisciplinePayload({
      reviewLog,
      cards,
      sessionSectionKeys: sessionKeysRef.current,
    });
    recordDiscipline.mutate(payload, {
      onError: (err) => logger.warn("[planner] recordDayDiscipline failed", err),
    });
  }, [recordDiscipline]);

  return { trackSection, resetSession, recordAfterSession };
}
