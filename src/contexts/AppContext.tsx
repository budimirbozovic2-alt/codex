// ═══════════════════════════════════════════════════════════
// COMPOSITION ROOT — Provider Cleanup v2 (finalized)
//
// App.tsx mounts: QueryClientProvider → TooltipProvider → HashRouter →
//   AppProvider → MainLayout.
//
// AppProvider tree:
//   RecoveryGate (DB error guard — pre-boot)
//     AppBootstrap (DAG: schema → load → cross-module wiring + UI side-fx)
//       MotionProvider (LazyMotion+strict + MotionConfig — design-system)
//         BootRecoveryGate (post-boot error UI)
//           children
//
// PomodoroProvider, UIProvider, SessionProvider are no-op shims; their
// state lives in Zustand stores (`usePomodoroStore`, `useUIStore`,
// `useSessionStore`). Consumer hooks scope re-renders via selectors.
// ═══════════════════════════════════════════════════════════
import { Suspense, lazy, ReactNode } from "react";
import { AppBootstrap } from "./AppBootstrap";
import { BootRecoveryGate } from "./boot/BootRecoveryGate";
import { useDbError } from "./db/DbErrorProvider";
import { MotionProvider } from "@/lib/motion";

const LazyDatabaseRecoveryPanel = lazy(() => import("@/components/DatabaseRecoveryPanel"));

// ─── Public re-exports (preserve existing import paths) ──
export type { View } from "./routing/useCurrentView";
export { useCurrentView } from "./routing/useCurrentView";

export type { PomodoroState } from "@/store/usePomodoroStore";
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
      <MotionProvider>
        <BootRecoveryGate>
          {children}
        </BootRecoveryGate>
      </MotionProvider>
    </RecoveryGate>
  );
}
