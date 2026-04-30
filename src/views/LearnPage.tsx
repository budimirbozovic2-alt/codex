import { useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useCardData, useCategoryData, useReviewData, useCardOnlyActions, useUIContext } from "@/contexts/AppContext";
import { useSessionContext, QueuedReview, QueuedError, QueuedMarkRead } from "@/contexts/SessionContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LearnSession from "@/components/LearnSession";
import { Card } from "@/lib/spaced-repetition";
import { FREQUENCY_TAGS } from "@/lib/sr/format";
import type { FrequencyTag } from "@/lib/sr/types";
import type { InitialFilters } from "@/components/learn/types";
import { useEditReturn } from "@/hooks/useEditReturn";
import { getParam } from "@/lib/url-params";

export default function LearnPage() {
  const { cards, stats, ready } = useCardData();
  const { categories, categoryRecords, subcategories } = useCategoryData();
  const { reviewLog } = useReviewData();
  const { markRead, reviewSection, addKeyPart } = useCardOnlyActions();
  const { setView, setEditingCard } = useUIContext();
  const session = useSessionContext();
  const location = useLocation();

  // Stable ref to session — its value identity changes on every queueSize update,
  // which previously caused handleMarkRead/handleReviewSection to be re-created
  // on every queue tick and triggered an infinite markRead loop in StudyModeRecall.
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const initialFilters = useMemo<InitialFilters | undefined>(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("mode") !== "strict-recall") return undefined;
    const freq = params.get("freq");
    const sort = params.get("sort");
    const type = params.get("type");
    return {
      mode: "strict-recall",
      categoryId: getParam(params, "category"),
      subcategoryId: getParam(params, "subcategory"),
      type: (type === "essay" || type === "flash") ? type : "all",
      frequencyTag: (FREQUENCY_TAGS.some(t => t.value === freq) ? (freq as FrequencyTag) : "all"),
      sortMode: sort === "weakest" ? "weakest" : "order",
    };
  }, [location.search]);

  useEffect(() => {
    if (ready) session.startSession(cards, reviewLog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handleMarkRead = useCallback((id: string) => {
    const s = sessionRef.current;
    if (s.isSessionActive) s.queueMarkRead(id);
    markRead(id);
  }, [markRead]);

  const handleReviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
    const s = sessionRef.current;
    if (s.isSessionActive) s.queueReview(cardId, sectionId, grade);
    reviewSection(cardId, sectionId, grade);
  }, [reviewSection]);

  const handleBack = useCallback(() => {
    if (session.isSessionActive) {
      session.endSession(
        (_reviews: QueuedReview[]) => {},
        (_errors: QueuedError[]) => {},
        (_reads: QueuedMarkRead[]) => {},
      );
    }
    setView("dashboard");
  }, [session, setView]);

  const editingCardRef = useRef<Card | null>(null);
  const { stash: stashEditReturn } = useEditReturn({
    path: "/learn",
    cardId: () => editingCardRef.current?.id ?? null,
  });
  const handleEdit = useCallback((card: Card) => {
    editingCardRef.current = card;
    stashEditReturn();
    setEditingCard(card);
    setView("edit");
  }, [stashEditReturn, setEditingCard, setView]);

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Priprema gradiva...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Učenje" onNavigateHome={() => setView("dashboard")}>
      <LearnSession
        cards={cards}
        categories={categories}
        categoryRecords={categoryRecords}
        subcategories={subcategories}
        onMarkRead={handleMarkRead}
        onReviewSection={handleReviewSection}
        onBack={handleBack}
        onEdit={handleEdit}
        onAddKeyPart={addKeyPart}
        dueCount={stats.due}
        reviewLog={reviewLog}
        initialFilters={initialFilters}
      />
    </ErrorBoundary>
  );
}
