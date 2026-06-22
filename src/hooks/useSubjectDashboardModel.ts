import { useMemo } from "react";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCardsByCategory } from "@/store";
import { getDueCards, type Card } from "@/lib/spaced-repetition";
import { countConsolidationEligibleCards } from "@/lib/review-mode-builder";
import { useSrSettings } from "@/hooks/review/useReviewSettingsQuery";
import {
  aggregateSubjectProgress,
  type SubProgress,
} from "@/lib/subject/aggregators";

interface SubjectSubcategoryRef {
  id: string;
  name: string;
}

export interface SubjectDashboardModel {
  categoryRec: ReturnType<typeof useCategoryData>["categoryRecords"][number] | undefined;
  categoryName: string;
  subjectCards: Card[];
  subjectSubcategories: SubjectSubcategoryRef[];
  subjectDueCount: number;
  subProgressData: SubProgress[];
}

/**
 * Orchestrator hook for {@link import("@/views/SubjectDashboard").default}.
 *
 * Pulls subject scope (category record, subject-scoped cards, due count)
 * and pre-computes the heavy mastery/pct rollup via the pure
 * `aggregateSubjectProgress` selector. The view becomes a pure presenter.
 */
export function useSubjectDashboardModel(
  categoryId: string | undefined,
): SubjectDashboardModel {
  const { categoryRecords } = useCategoryData();
  const subjectCardsRo = useCardsByCategory(categoryId);
  const subjectCards = useMemo(
    () => subjectCardsRo as readonly Card[] as Card[],
    [subjectCardsRo],
  );

  const categoryRec = useMemo(
    () => categoryRecords.find((r) => r.id === categoryId),
    [categoryRecords, categoryId],
  );
  const categoryName = categoryRec?.name ?? "Nepoznat predmet";

  const subjectSubcategories = useMemo(
    () =>
      (categoryRec?.subcategories ?? []).map((s) => ({ id: s.id, name: s.name })),
    [categoryRec],
  );

  const subProgressData = useMemo(
    () =>
      categoryId && categoryRec
        ? aggregateSubjectProgress(subjectCards, categoryRec.subcategories ?? [])
        : [],
    [categoryId, categoryRec, subjectCards],
  );

  const srSettings = useSrSettings();

  const subjectDueCount = useMemo(() => {
    const dueCards = getDueCards(subjectCards);
    return countConsolidationEligibleCards({
      dueCards,
      allCards: subjectCards,
      srSettings,
    });
  }, [subjectCards, srSettings]);

  return {
    categoryRec,
    categoryName,
    subjectCards,
    subjectSubcategories,
    subjectDueCount,
    subProgressData,
  };
}
