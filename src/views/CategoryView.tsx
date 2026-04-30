import { useParams } from "react-router-dom";
import { useState, useCallback, useMemo, useEffect } from "react";
import { getCardMasteryLevel, MASTERY_LEVELS } from "@/lib/mastery";
import { type Source } from "@/lib/db";
import { invalidateSourcesCache, loadSourcesByCategory, onSourcesChanged } from "@/lib/sources-storage";
import { useCardData, useCategoryData, useCardActions } from "@/contexts/AppContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import SourceReader from "@/components/SourceReader";
import SourcesTab from "@/components/category/SourcesTab";
import SourcesBreadcrumb from "@/components/category/SourcesBreadcrumb";

export default function CategoryView() {
  const { categoryId } = useParams<{ categoryId: string }>();

  // ── Boot-loaded context data (SSoT) ──
  const { cards: allCards, ready } = useCardData();
  const { categoryRecords } = useCategoryData();

  const category = useMemo(
    () => categoryRecords.find(c => c.id === categoryId) ?? null,
    [categoryRecords, categoryId]
  );

  const cards = useMemo(
    () => categoryId ? allCards.filter(c => c.categoryId === categoryId) : [],
    [allCards, categoryId]
  );

  // Sources are not in context — keep useLiveQuery
  const sources = useLiveQuery(
    () => categoryId ? db.sources.where("categoryId").equals(categoryId).toArray() : [],
    [categoryId]
  ) ?? [];

  const { bulkFlagNeedsReview } = useCardActions();

  // Sources: reader state only (editor/import/delete moved to SourcesTab)
  const [readerSource, setReaderSource] = useState<Source | null>(null);

  // Auto-open source from GlobalSearch navigation
  useEffect(() => {
    const openId = sessionStorage.getItem("sr-open-source-id");
    if (!openId || sources.length === 0) return;
    sessionStorage.removeItem("sr-open-source-id");
    const found = sources.find(s => s.id === openId);
    if (found) setReaderSource(found);
  }, [sources]);

  const handleSourceUpdated = useCallback(() => {
    invalidateSourcesCache();
  }, []);

  const masteryDist = useMemo(() => {
    if (cards.length === 0) return null;
    const counts = [0, 0, 0, 0, 0, 0];
    cards.forEach(c => { counts[getCardMasteryLevel(c)]++; });
    return counts;
  }, [cards]);

  // Full-screen reader mode
  if (readerSource) {
    return (
      <SourceReader
        source={readerSource}
        onBack={() => setReaderSource(null)}
        onSourceUpdated={(updated) => { setReaderSource(updated); invalidateSourcesCache(); }}
      />
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Kategorija nije pronađena.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + context indicator */}
      <SourcesBreadcrumb categoryId={categoryId!} categoryName={category.name} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground flex-1">{category.name}</h1>
      </div>

      {/* Mastery progress bar (informational only) */}
      {masteryDist && (
        <div className="space-y-1.5">
          <TooltipProvider delayDuration={200}>
            <div className="h-2.5 rounded-full overflow-hidden flex bg-secondary">
              {masteryDist.map((count, i) => {
                const pct = (count / cards.length) * 100;
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

      {/* Sources only — Mapa znanja & Struktura moved to SubjectDashboard / SubjectCardsView */}
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
