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
// ═══════════════════════════════════════════════════════════
import { Suspense, lazy, ReactNode } from "react";
import { AppBootstrap } from "./AppBootstrap";
import { BootRecoveryGate } from "./boot/BootRecoveryGate";
import { useDbError } from "@/hooks/useDbError";
import { MotionProvider } from "@/lib/motion";

const LazyDatabaseRecoveryPanel = lazy(() => import("@/components/DatabaseRecoveryPanel"));

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

// Audit v2 / Wave B.2: `AppBootstrap` lives **outside** `RecoveryGate` so a
// transient `dbError → null` flip does NOT unmount the boot orchestrator.
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
