import { Info } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { TabSkeleton } from "@/components/ui/page-skeleton";

const HealthMonitor = lazy(() => import("@/components/HealthMonitor"));

export default function SystemTab() {
  return (
    <div className="space-y-5">
      {/* Backup relocation notice */}
      <div className="glass-card rounded-xl p-5 space-y-2">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Info className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Backup &amp; Restore je premješten</h3>
            <p className="text-xs text-muted-foreground">
              Kontrola izvoza i uvoza podataka sada se nalazi na <Link to="/" className="text-primary hover:underline">kontrolnoj tabli</Link>,
              odmah ispod kartica za Strateški planer i Statistiku.
            </p>
          </div>
        </div>
      </div>

      {/* Health Monitor */}
      <Suspense fallback={<TabSkeleton />}>
        <HealthMonitor />
      </Suspense>
    </div>
  );
}
