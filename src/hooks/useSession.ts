/**
 * Provider Cleanup v2 — `SessionContext` is now a backwards-compat shim
 * over `@/store/useSessionStore`. State, queues and persistQueue
 * subscription live in the store; this file re-exports the public API so
 * existing callers (`LearnPage`, `ReviewPage`, `ProcessingOverlay`, tests)
 * continue to compile unchanged.
 */
import type { ReactNode } from "react";

export type {
  QueuedReview,
  QueuedError,
  QueuedMarkRead,
  SessionSnapshot,
  SessionApi,
} from "@/store/useSessionStore";

export { useSessionContext } from "@/store/useSessionStore";

/** @deprecated Provider removed in v2 cleanup. Kept as no-op shim. */
export function SessionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
