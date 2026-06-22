import { Suspense, lazy } from "react";
import SessionComplete from "./learn/SessionComplete";
import FilterSetup from "./learn/FilterSetup";
import EmptyState from "@/components/EmptyState";
import { SessionCardSkeleton } from "@/components/ui/loading";
import { LearnSessionProps } from "./learn/types";
import { useLearnSession } from "@/hooks/useLearnSession";

const StudyModeRecall = lazy(() => import("./learn/StudyModeRecall"));

export default function LearnSession(props: LearnSessionProps) {
  const session = useLearnSession(props);

  if (!session.started) {
    return (
      <FilterSetup
        cards={session.cards}
        sortedCardsCount={session.sortedCards.length}
        categories={session.availableCategories}
        categoryRecords={session.categoryRecords}
        subcategories={session.subcategories}
        selectedCategory={session.selectedCategory}
        selectedSubcategory={session.selectedSubcategory}
        selectedChapter={session.selectedChapter}
        frequencyFilter={session.frequencyFilter}
        frequencyCounts={session.frequencyCounts}
        filterType={session.filterType}
        sortMode={session.sortMode}
        onSelectCategory={session.handleSelectCategory}
        onSelectSubcategory={session.handleSelectSubcategory}
        onSelectChapter={session.setSelectedChapter}
        onFrequencyFilterChange={session.setFrequencyFilter}
        onFilterTypeChange={session.setFilterType}
        onSortModeChange={session.setSortMode}
        onStart={session.handleStart}
        onBack={session.onBack}
      />
    );
  }

  if (!session.card && session.sortedCards.length === 0) {
    return (
      <EmptyState
        type="learn-filter"
        onAction={session.handleEmptyFilterAction}
      />
    );
  }

  if (session.sessionFinished) {
    return (
      <SessionComplete
        sessionStartTime={session.sessionStartTime}
        totalGrades={session.totalGrades}
        modulesCompleted={session.modulesCompleted}
        readCardsCount={session.readCards.size}
        completedCardsCount={session.completedCards.size}
        onBack={session.onBack}
      />
    );
  }

  const fallback = <SessionCardSkeleton />;

  if (!session.card) {
    return fallback;
  }

  return (
    <Suspense fallback={fallback}>
      <StudyModeRecall
        card={session.card}
        allCards={session.cards}
        sortedCards={session.sortedCards}
        currentIndex={session.effectiveIndex}
        viewWidth={session.viewWidth}
        setViewWidth={session.setViewWidth}
        readCards={session.readCards}
        completedCards={session.completedCards}
        chainCompletedCards={session.chainCompletedCards}
        onMarkRead={session.handleMarkRead}
        onReviewSection={session.handleReviewSection}
        onAddKeyPart={session.onAddKeyPart}
        goToCard={session.goToCard}
        goNext={session.goNext}
        goPrev={session.goPrev}
        onBack={session.handleActiveBack}
        setCompletedCards={session.setCompletedCards}
        setTotalGrades={session.setTotalGrades}
        setModulesCompleted={session.setModulesCompleted}
        updateProgress={session.updateProgress}
        cardProgress={session.cardProgress}
        strictRecall={session.isStrictRecall}
      />
    </Suspense>
  );
}
