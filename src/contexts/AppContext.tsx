// ═══════════════════════════════════════════════════════════
// COMPOSITION ROOT — Provider Cleanup v2
//
// Single umbrella for all app-data wrappers. App.tsx now only mounts
// Tooltip → HashRouter → AppProvider → MainLayout (3 wrappers).
//
// Internal order:
//   RecoveryGate (DB error guard — pre-boot)
//     AppBootstrap (DAG: schema → load → cross-module wiring)
//     PomodoroProvider
//       UIProvider
//         SessionProvider
//           BootRecoveryGate (boot-state guard — schema/load errors)
//             children
// ═══════════════════════════════════════════════════════════
import { Suspense, lazy, ReactNode } from "react";
import { AppBootstrap } from "./AppBootstrap";
import { PomodoroProvider } from "./pomodoro/PomodoroProvider";
import { UIProvider } from "./ui/UIProvider";
import { SessionProvider } from "./SessionContext";
import { BootRecoveryGate } from "./boot/BootRecoveryGate";
import { useDbError } from "./db/DbErrorProvider";

const LazyDatabaseRecoveryPanel = lazy(() => import("@/components/DatabaseRecoveryPanel"));

// ─── Public re-exports (preserve existing import paths) ──
export type { View } from "./routing/useCurrentView";
export { useCurrentView } from "./routing/useCurrentView";

export type { PomodoroState } from "./pomodoro/usePomodoroEngine";
export {
  usePomodoroStable,
  usePomodoroTick,
  usePomodoroContext,
} from "./pomodoro/PomodoroProvider";

export { useUIContext } from "./ui/UIProvider";

export {
  useCardData,
  useReviewData,
  useCategoryStatsData,
  useSettingsActions,
} from "./cards/CardStateProvider";
export { useCategoryData } from "./cards/CategoryStateProvider";
export {
  useCardOnlyActions,
  useCategoryActions,
  useBackupActions,
} from "./cards/useActions";
export { useDbError } from "./db/DbErrorProvider";

// ─── DB-error recovery gate (pre-boot) ───────────────────
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

// ─── Composition root ────────────────────────────────────
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <RecoveryGate>
      <AppBootstrap />
      <PomodoroProvider>
        <UIProvider>
          <SessionProvider>
            <BootRecoveryGate>
              {children}
            </BootRecoveryGate>
          </SessionProvider>
        </UIProvider>
      </PomodoroProvider>
    </RecoveryGate>
  );
}
