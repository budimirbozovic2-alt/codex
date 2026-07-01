import { useSessionContext } from "@/store/useSessionStore";

/**
 * Whether a long-running session operation is in progress. Wraps the session
 * store so UI components read processing state through the hooks layer.
 */
export function useIsProcessing(): boolean {
  return useSessionContext().isProcessing;
}
