import { Skeleton } from "@/components/ui/skeleton";

/** Shape-matched skeleton for DashboardPage boot + lazy route fallback. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-fade-in" data-testid="dashboard-skeleton" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-10 w-64" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-8 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-5 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
          <div className="glass-card rounded-xl p-5 space-y-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
          <div className="glass-card rounded-xl p-5 space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>

        <aside className="space-y-5 min-w-0">
          <div className="glass-card rounded-xl p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="glass-card rounded-xl p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-[140px] w-full rounded-lg" />
          </div>
        </aside>
      </div>
    </div>
  );
}
