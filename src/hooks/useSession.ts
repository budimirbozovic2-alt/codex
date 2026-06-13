/**
 * Provider Cleanup v2 — `SessionContext` is now a backwards-compat shim
 * over `@/store/useSessionStore`. State and queues live in the store;
 * `isProcessing` lives in the Zustand store and clears after mutation drain.
 * This file re-exports the public API so existing callers (`LearnPage`,
 * `ReviewPage`, `ProcessingOverlay`, tests) continue to compile unchanged.
 */

export type {
  QueuedReview,
  QueuedError,
  QueuedMarkRead,
} from "@/store/useSessionStore";

export { useSessionContext } from "@/store/useSessionStore";
