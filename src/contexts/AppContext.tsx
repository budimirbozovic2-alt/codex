/* eslint-disable react-refresh/only-export-components --
 * AppContext.tsx is an intentional barrel: it re-exports ~10 hooks from
 * @/hooks/* alongside the AppProvider component to preserve historical
 * import paths. Splitting would touch dozens of import sites with no
 * functional benefit. Fast Refresh boundary loss is acceptable here.
 */
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
// Pomodoro/UI/Session state lives in Zustand stores (`usePomodoroStore`,
// `useUIStore`, `useSessionStore`) — the v1 Provider shims were dropped in
// Provider Cleanup v2. Consumer hooks (`usePomodoroStable`, `useUIContext`,
// etc.) scope re-renders via selectors.
// ═══════════════════════════════════════════════════════════
import { Suspense, lazy, ReactNode } from "react";
import { AppBootstrap } from "./AppBootstrap";
import { BootRecoveryGate } from "./boot/BootRecoveryGate";
import { useDbError } from "@/hooks/useDbError";
import { MotionProvider } from "@/lib/motion";

const LazyDatabaseRecoveryPanel = lazy(() => import("@/components/DatabaseRecoveryPanel"));

// ─── Public re-exports (preserve existing import paths) ──
export type { View } from "@/hooks/useCurrentView";
export { useCurrentView } from "@/hooks/useCurrentView";

export type { PomodoroState } from "@/store/usePomodoroStore";
export {
  usePomodoroStable,
  usePomodoroTick,
  usePomodoroContext,
} from "@/hooks/usePomodoro";

export { useUIContext } from "@/hooks/useUI";

export {
  useCardData,
  useReviewData,
  useCategoryStatsData,
  useSettingsActions,
} from "@/hooks/cards/useCardState";
export { useCategoryData } from "@/hooks/cards/useCategoryState";
export {
  useCardOnlyActions,
  useCategoryActions,
  useBackupActions,
} from "@/hooks/cards/useActions";
export { useDbError } from "@/hooks/useDbError";

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
//
// Audit v2 / Wave B.2: `AppBootstrap` lives **outside** `RecoveryGate` so a
// transient `dbError → null` flip does NOT unmount the boot orchestrator
// and rerun the entire `bootDb → runSchema → loadInitialData` DAG. The
// single-shot `initialLoadDone` ref previously lived inside the remounted
// instance and reset to `false` on every remount, causing duplicate boot
// runs over an already-ready state machine.
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <AppBootstrap />
      <RecoveryGate>
        <MotionProvider>
          <BootRecoveryGate>
            {children}
          </BootRecoveryGate>
        </MotionProvider>
      </RecoveryGate>
    </>
  );
}

