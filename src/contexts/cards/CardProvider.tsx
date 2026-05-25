/**
 * Provider Cleanup v2 — CardProvider is now a thin recovery gate + boot
 * mount. No Context providers, no Action providers, no Category bridges
 * (those are now hooks invoked by `<AppBootstrap />`).
 */
import { Suspense, lazy, type ReactNode } from "react";
import { AppBootstrap } from "@/contexts/AppBootstrap";
import { useDbError } from "@/contexts/db/DbErrorProvider";

const LazyDatabaseRecoveryPanel = lazy(() => import("@/components/DatabaseRecoveryPanel"));

// ─────────────────────────────────────────────────────────────
// Public hooks — focused re-exports. Source files moved to stores
// but the import paths remain stable for view code.
// ─────────────────────────────────────────────────────────────
export {
  useCardData,
  useReviewData,
  useCategoryStatsData,
  useSettingsActions,
} from "./CardStateProvider";
export { useCategoryData } from "./CategoryStateProvider";
export { useCardOnlyActions, useCategoryActions, useBackupActions } from "./useActions";
export { useDbError } from "@/contexts/db/DbErrorProvider";

// ─────────────────────────────────────────────────────────────
// Composition root
// ─────────────────────────────────────────────────────────────
function RecoveryGate({ children }: { children: ReactNode }) {
  const dbError = useDbError();
  if (dbError) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-muted-foreground">Učitavanje...</div>}>
        <LazyDatabaseRecoveryPanel error={dbError} />
      </Suspense>
    );
  }
  return <>{children}</>;
}

export function CardProvider({ children }: { children: ReactNode }) {
  return (
    <RecoveryGate>
      <AppBootstrap />
      {children}
    </RecoveryGate>
  );
}
