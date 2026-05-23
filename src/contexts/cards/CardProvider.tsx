import { Suspense, lazy, type ReactNode } from "react";
import { CategoryStateProvider } from "./CategoryStateProvider";
import { CardStateProvider } from "./CardStateProvider";
import { ActionsProvider } from "./ActionsProvider";
import { useDbError } from "@/contexts/db/DbErrorProvider";

const LazyDatabaseRecoveryPanel = lazy(() => import("@/components/DatabaseRecoveryPanel"));

// ─────────────────────────────────────────────────────────────
// Public hooks — focused re-exports, no merged shims.
// Components import directly from the right domain provider.
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
    <CategoryStateProvider>
      <CardStateProvider>
        <ActionsProvider>
          <RecoveryGate>{children}</RecoveryGate>
        </ActionsProvider>
      </CardStateProvider>
    </CategoryStateProvider>
  );
}
