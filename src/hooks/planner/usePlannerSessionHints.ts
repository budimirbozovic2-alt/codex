import { useMemo } from "react";
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import type { CategoryRecord } from "@/lib/db-types";
import {
  computePlannerSessionHints,
  type PlannerSessionHints,
} from "@/domains/planner/session-hints";

interface Options {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  categoryRecords: CategoryRecord[];
  dueCount: number;
  scopedDueCount?: number;
}

export function usePlannerSessionHints(opts: Options): PlannerSessionHints {
  const { cards, reviewLog, categoryRecords, dueCount, scopedDueCount } = opts;
  return useMemo(
    () =>
      computePlannerSessionHints({
        cards,
        reviewLog,
        categoryRecords,
        dueCount,
        scopedDueCount,
      }),
    [cards, reviewLog, categoryRecords, dueCount, scopedDueCount],
  );
}
