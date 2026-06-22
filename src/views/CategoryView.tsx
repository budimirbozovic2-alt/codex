import { useParams, Link } from "react-router-dom";
import { useState, useCallback, useEffect, useMemo } from "react";
import { MASTERY_LEVELS } from "@/lib/mastery";
import type { Source } from "@/lib/db-types";
import { useCategorySourcesWithStatus } from "@/hooks/useCategorySources";
import { useCardOnlyActions } from "@/hooks/cards/useActions";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useAppDataReady } from "@/hooks/cards/useCardState";
import { useMasteryDistributionByCategory } from "@/hooks/card/useCardsQuery";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CategoryHeaderSkeleton, SourcesTabSkeleton } from "@/components/ui/list-skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { FetchErrorPanel } from "@/components/ui/FetchErrorPanel";
import SourceReader from "@/components/SourceReader";
import SourcesTab from "@/components/category/SourcesTab";
import SourcesBreadcrumb from "@/components/category/SourcesBreadcrumb";
import {
  consumePendingSourceOpen,
  SOURCE_READER_OPEN_EVENT,
} from "@/lib/source-reader/pending-source-open";
import { setImmersiveMode, setTitleBarContext } from "@/store/useUIStore";
import { getSourceContentDirty, resetSourceContentSave, flushSourceContentSave } from "@/store/useSourceContentSaveStore";
import { useSourceReaderStore } from "@/store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function CategoryView() {
  const { categoryId } = useParams<{ categoryId: string }>();

  const ready = useAppDataReady();
  const { categoryRecords } = useCategoryData();

  const category = useMemo(
    () => categoryRecords.find(c => c.id === categoryId) ?? null,
    [categoryRecords, categoryId]
  );

  const {
    distribution: masteryDist,
    totalCards,
    isLoading: masteryLoading,
  } = useMasteryDistributionByCategory(categoryId);

  const {
    sources,
    isLoading: sourcesLoading,
    isError: sourcesError,
    refetch: refetchSources,
  } = useCategorySourcesWithStatus(categoryId);
  const { bulkFlagNeedsReview } = useCardOnlyActions();

  const [readerSource, setReaderSource] = useState<Source | null>(null);

  useEffect(() => {
    setImmersiveMode(!!readerSource);
    if (readerSource) {
      useSourceReaderStore.setState({ outlineOpen: false, examOpen: false });
      setTitleBarContext({
        label: category?.name ?? "Kategorija",
        detail: readerSource.title,
      });
    } else if (category) {
      setTitleBarContext({ label: category.name });
    } else {
      setTitleBarContext(null);
    }
    return () => {
      setImmersiveMode(false);
      setTitleBarContext(null);
    };
  }, [readerSource, category]);

  const openPendingSource = useCallback(() => {
    const result = consumePendingSourceOpen(sources);
    if (result.source) {
      setReaderSource(result.source);
    } else if (result.missedId) {
      toast.error("Izvor nije pronađen", {
        description: "Traženi dokument više ne postoji u ovoj kategoriji.",
      });
    }
  }, [sources]);

  useEffect(() => {
    openPendingSource();
  }, [openPendingSource, categoryId]);

  useEffect(() => {
    const handler = () => { openPendingSource(); };
    window.addEventListener(SOURCE_READER_OPEN_EVENT, handler);
    return () => window.removeEventListener(SOURCE_READER_OPEN_EVENT, handler);
  }, [openPendingSource]);

  const handleSourceUpdated = useCallback(() => {}, []);

  const handleReaderBack = useCallback(async () => {
    const { editMode } = useSourceReaderStore.getState();
    if (editMode && getSourceContentDirty()) {
      const saved = await flushSourceContentSave();
      if (!saved) {
        const leave = window.confirm("Čuvanje nije uspjelo. Napustiti bez čuvanja?");
        if (!leave) return;
      }
    }
    resetSourceContentSave();
    setReaderSource(null);
  }, []);

  const handleReaderSourceUpdated = useCallback((updated: Source) => {
    setReaderSource(updated);
  }, []);

  if (readerSource) {
    return (
      <SourceReader
        source={readerSource}
        onBack={handleReaderBack}
        onSourceUpdated={handleReaderSourceUpdated}
      />
    );
  }

  const showSkeleton =
    !ready ||
    (masteryLoading && totalCards === 0) ||
    (sourcesLoading && sources.length === 0);

  if (showSkeleton) {
    return (
      <div className="space-y-6" data-testid="category-view-loading">
        <CategoryHeaderSkeleton />
        <SourcesTabSkeleton />
      </div>
    );
  }

  if (sourcesError) {
    return (
      <FetchErrorPanel
        title="Greška pri učitavanju izvora"
        description="Podaci o izvorima nisu učitani. Provjerite bazu i pokušajte ponovo."
        backTo="/categories"
        backLabel="Nazad na predmete"
        onRetry={() => void refetchSources()}
      />
    );
  }

  if (!category) {
    return (
      <div className="space-y-8 animate-fade-in">
        <PageHeader
          eyebrow="Kategorija"
          title="Kategorija nije pronađena"
          subtitle="Predmet možda više ne postoji ili je uklonjen."
        />
        <div className="flex justify-center">
          <Button variant="outline" asChild>
            <Link to="/categories">Nazad na predmete</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <SourcesBreadcrumb categoryId={categoryId!} categoryName={category.name} />

      <PageHeader
        eyebrow="Kategorija"
        title={category.name}
      />

      {masteryDist && (
        <div className="space-y-1.5">
          <TooltipProvider delayDuration={200}>
            <div className="h-2.5 rounded-full overflow-hidden flex bg-secondary">
              {masteryDist.map((count, i) => {
                const pct = (count / totalCards) * 100;
                return count > 0 ? (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-full transition-[width,filter] duration-700 ease-out hover:brightness-125"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: MASTERY_LEVELS[i].color,
                          animationDelay: `${i * 80}ms`,
                        } as React.CSSProperties}
                        ref={(el) => {
                          if (el && !el.dataset.animated) {
                            el.style.width = '0%';
                            requestAnimationFrame(() => {
                              el.style.width = `${pct}%`;
                              el.dataset.animated = '1';
                            });
                          }
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {MASTERY_LEVELS[i].label}: {count} ({Math.round(pct)}%)
                    </TooltipContent>
                  </Tooltip>
                ) : null;
              })}
            </div>
          </TooltipProvider>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 opacity-0 animate-fade-in" style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}>
            {masteryDist.map((count, i) =>
              count > 0 ? (
                <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MASTERY_LEVELS[i].color }} />
                  {MASTERY_LEVELS[i].label} {count}
                </span>
              ) : null
            )}
          </div>
        </div>
      )}

      <SourcesTab
        categoryId={categoryId!}
        sources={sources}
        onOpenReader={setReaderSource}
        onSourceUpdated={handleSourceUpdated}
        bulkFlagNeedsReview={bulkFlagNeedsReview}
      />
    </div>
  );
}
