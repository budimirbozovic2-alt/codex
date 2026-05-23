import { useSyncExternalStore, type ReactNode } from "react";
import {
  getBootState,
  subscribeBootState,
  type BootPhase,
} from "@/lib/boot";

/**
 * Reactive bridge nad modul-level bootStateMachine signalom. Komponente
 * čitaju `useBootState()`, dok pre-React pozivaoci (`ensureDbOpen`,
 * `bootDb`) direktno emituju `transition()` u modul-level signal.
 */
export function useBootState(): BootPhase {
  return useSyncExternalStore(subscribeBootState, getBootState, getBootState);
}

/**
 * Provider je no-op wrapper (signal je module-level) ali postoji radi
 * konzistentnosti sa ostalim domain provider-ima i kasnijeg dodavanja
 * scoped state-a (npr. recovery action handlers).
 */
export function BootStateProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
