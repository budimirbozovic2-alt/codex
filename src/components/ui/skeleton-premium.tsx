import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Premium skeleton primitives — typed, compositional replacements for
 * scattered `<Loader2 className="animate-spin" />` placeholders. Keeps
 * layout dimensions stable so content slides in without a reflow jolt.
 */

interface SkeletonRowProps {
  lines?: number;
  className?: string;
  /** Last line gets a shorter width for natural paragraph rhythm. */
  lastLineWidth?: string;
}

export function SkeletonRow({ lines = 3, className, lastLineWidth = "60%" }: SkeletonRowProps) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5 rounded-sm"
          style={i === lines - 1 ? { width: lastLineWidth } : undefined}
        />
      ))}
    </div>
  );
}

interface SkeletonCardProps {
  className?: string;
  showAvatar?: boolean;
  lines?: number;
}

export function SkeletonCard({ className, showAvatar = false, lines = 3 }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-hairline bg-surface-1/60 p-5 shadow-soft",
        "animate-fade-up",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-start gap-3">
        {showAvatar && <Skeleton className="h-10 w-10 rounded-full shrink-0" />}
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-2/5 rounded-sm" />
          <SkeletonRow lines={lines} />
        </div>
      </div>
    </div>
  );
}

interface SkeletonStatProps {
  className?: string;
}

/** KPI-shaped placeholder for the dashboard CoreStats grid. */
export function SkeletonStat({ className }: SkeletonStatProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-hairline bg-surface-1/60 p-5 shadow-soft",
        "animate-fade-up",
        className,
      )}
      aria-hidden="true"
    >
      <Skeleton className="h-3 w-20 rounded-sm" />
      <Skeleton className="mt-4 h-9 w-24 rounded-md" />
      <Skeleton className="mt-3 h-3 w-32 rounded-sm" />
    </div>
  );
}

interface SkeletonListProps {
  rows?: number;
  className?: string;
}

export function SkeletonList({ rows = 5, className }: SkeletonListProps) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-1/40 p-3"
        >
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2 rounded-sm" />
            <Skeleton className="h-3 w-1/3 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}
