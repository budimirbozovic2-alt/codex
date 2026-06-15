import { Skeleton } from "@/components/ui/skeleton";

/** Shape-matched skeleton for Review/Learn setup screens. */
export function SessionSetupSkeleton() {
  return (
    <div
      className="max-w-3xl mx-auto space-y-6 py-10 animate-fade-in"
      data-testid="session-setup-skeleton"
      aria-busy="true"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card rounded-xl p-5 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}
