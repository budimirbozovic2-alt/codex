import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Layout-shape loading placeholders for CategoryView.
 *
 * Pilot ("No more empty blinks") — these match the actual render shape
 * (header chip + mastery bar + tab strip + N list rows) so the transition
 * from skeleton → real content has zero layout shift.
 */

export function CategoryHeaderSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true" data-testid="category-header-skeleton">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-48" />

      {/* Title */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-72" />
      </div>

      {/* Mastery bar */}
      <div className="space-y-1.5">
        <Skeleton className="h-2.5 w-full rounded-full" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

interface ListSkeletonProps {
  rows?: number;
  className?: string;
  /** When true, render compact rows (used for source/mind-map lists). */
  compact?: boolean;
}

export function ListSkeleton({ rows = 6, className, compact = false }: ListSkeletonProps) {
  const rowHeight = compact ? "h-14" : "h-16";
  return (
    <div
      className={cn("space-y-2", className)}
      aria-hidden="true"
      data-testid="list-skeleton"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2.5",
            rowHeight,
          )}
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Combined skeleton for the SourcesTab body — tab strip + list.
 */
export function SourcesTabSkeleton() {
  return (
    <div className="space-y-4" data-testid="sources-tab-skeleton">
      {/* Tab strip */}
      <div className="flex gap-1 border-b border-border/40 pb-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <ListSkeleton rows={4} compact />
    </div>
  );
}
