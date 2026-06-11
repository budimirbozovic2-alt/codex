/**
 * Provider Cleanup v2 — `SessionContext` is now a backwards-compat shim
 * over `@/store/useSessionStore`. State and queues live in the store;
 * `useSessionContext` also tracks TanStack pending mutations for `isProcessing`.
 * This file re-exports the public API so existing callers (`LearnPage`,
 * `ReviewPage`, `ProcessingOverlay`, tests) continue to compile unchanged.
 */

export type {
  QueuedReview,
  QueuedError,
  QueuedMarkRead,
  SessionSnapshot,
  SessionApi,
} from "@/store/useSessionStore";

export { useSessionContext } from "@/store/useSessionStore";
