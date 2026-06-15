import { Skeleton } from "@/components/ui/skeleton";

/** Shape-matched skeleton for active review/recall card UI. */
export function SessionCardSkeleton() {
  return (
    <div
      className="max-w-2xl mx-auto space-y-6 py-4 animate-fade-in"
      data-testid="session-card-skeleton"
      aria-busy="true"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="rounded-xl border bg-card p-8 space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-4/5" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
