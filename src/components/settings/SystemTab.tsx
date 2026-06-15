import { lazy, Suspense } from "react";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import { BackupCard } from "@/components/dashboard/BackupCard";
import { AppUpdatePanel } from "@/components/settings/AppUpdatePanel";
import SettingsSection from "@/components/settings/SettingsSection";

const HealthMonitor = lazy(() => import("@/components/HealthMonitor"));

export default function SystemTab() {
  return (
    <div className="space-y-8">
      <SettingsSection title="Backup i vraćanje">
        <BackupCard variant="settings" />
      </SettingsSection>

      <SettingsSection title="Ažuriranje aplikacije">
        <AppUpdatePanel variant="settings" />
      </SettingsSection>

      <SettingsSection title="Zdravlje baze">
        <div className="py-3.5">
          <Suspense fallback={<TabSkeleton />}>
            <HealthMonitor />
          </Suspense>
        </div>
      </SettingsSection>
    </div>
  );
}
