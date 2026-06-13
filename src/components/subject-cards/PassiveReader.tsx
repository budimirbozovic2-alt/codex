import { lazy, Suspense, useMemo } from "react";
import { BookOpen, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Card } from "@/lib/spaced-repetition";
import type { SubcategoryNode } from "@/lib/db-types";
import { usePassiveReaderFilters } from "./passive-reader/usePassiveReaderFilters";
import { usePassiveReaderNavigation } from "./passive-reader/usePassiveReaderNavigation";
import { useCardStats } from "./passive-reader/useCardStats";
import { PassiveReaderFilters } from "./passive-reader/PassiveReaderFilters";
import { PassiveReaderPager } from "./passive-reader/PassiveReaderPager";

// Lazy: pulls ContentRenderer (Tiptap) out of the initial SubjectCardsView chunk.
const PassiveReaderCard = lazy(() =>
  import("./passive-reader/PassiveReaderCard").then(m => ({ default: m.PassiveReaderCard })),
);

function PassiveReaderCardSkeleton() {
  return (
    <Skeleton
      className="rounded-2xl border border-border/60"
      style={{ height: 420 }}
      role="status"
      aria-busy="true"
      aria-label="Učitavanje kartice…"
    />
  );
}

interface Props {
  cards: Card[];
  subcategoryNodes: SubcategoryNode[];
  categoryId: string;
  onEditCard?: (card: Card) => void;
  /** When set, the reader will clear filters (if needed) and jump to this card. */
  initialCardId?: string | null;
  /** Called once the initialCardId has been honored, so the parent can clear it. */
  onInitialConsumed?: () => void;
}

export default function PassiveReader({
  cards, subcategoryNodes, categoryId, onEditCard, initialCardId, onInitialConsumed,
}: Props) {
  const filters = usePassiveReaderFilters(categoryId, subcategoryNodes);

  const filtered = useMemo(() => {
    let list = cards.slice();
    if (filters.subFilter !== "all") list = list.filter(c => c.subcategoryId === filters.subFilter);
    if (filters.chapterFilter !== "all") list = list.filter(c => c.chapterId === filters.chapterFilter);
    if (filters.typeFilter !== "all") list = list.filter(c => c.type === filters.typeFilter);
    return list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }, [cards, filters.subFilter, filters.chapterFilter, filters.typeFilter]);

  const { index, next, prev } = usePassiveReaderNavigation({
    cards, filtered, filters, initialCardId, onInitialConsumed,
  });

  const current = filtered[index];
  const stats = useCardStats(current);

  return (
    <div className="space-y-4">
      <PassiveReaderFilters
        filters={filters}
        subcategoryNodes={subcategoryNodes}
        total={filtered.length}
        index={index}
      />

      {current && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="ml-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs"
              onClick={() => onEditCard?.(current)}
              disabled={!onEditCard}
            >
              <Pencil className="h-3.5 w-3.5" />
              Uredi karticu
            </Button>
          </div>
        </div>
      )}

      {!current ? (
        <div className="glass-card rounded-xl p-12 text-center text-sm text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Nema kartica za prikaz uz odabrane filtere.
        </div>
      ) : (
        <Suspense fallback={<PassiveReaderCardSkeleton />}>
          <PassiveReaderCard key={current.id} card={current} stats={stats} />
        </Suspense>
      )}

      <PassiveReaderPager
        index={index}
        total={filtered.length}
        onPrev={prev}
        onNext={next}
      />
    </div>
  );
}
