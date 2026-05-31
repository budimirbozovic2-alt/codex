import { useSyncExternalStore } from "react";
import {
  getBootState,
  subscribeBootState,
  type BootPhase,
} from "@/lib/boot";

/**
 * Reactive bridge nad modul-level bootStateMachine signalom. Provider je
 * uklonjen (bio no-op) — `useBootState()` čita direktno iz module store-a
 * preko `useSyncExternalStore`. Pre-React pozivaoci (`ensureDbOpen`,
 * `bootDb`) i dalje emituju `transition()` u isti modul-level signal.
 */
export function useBootState(): BootPhase {
  return useSyncExternalStore(subscribeBootState, getBootState, getBootState);
}
