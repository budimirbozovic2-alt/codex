import { lazy, Suspense } from "react";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import { BackupCard } from "@/components/dashboard/BackupCard";
import { AppUpdatePanel } from "@/components/settings/AppUpdatePanel";

const HealthMonitor = lazy(() => import("@/components/HealthMonitor"));

export default function SystemTab() {
  return (
    <div className="space-y-5">
      <BackupCard />

      <AppUpdatePanel />

      <Suspense fallback={<TabSkeleton />}>
        <HealthMonitor />
      </Suspense>
    </div>
  );
}
