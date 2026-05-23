/**
 * `useBeforeUnloadGuard` — browser-level "Are you sure you want to leave?"
 * prompt whenever the central draft registry has any dirty key.
 *
 * Electron note: in the packaged app the OS-level "you have unsaved changes"
 * dialog is intentionally NOT shown — instead the main process listens for
 * `before-quit` and asks renderer to flush. The web/preview environment still
 * benefits from the native confirm, so we install it unconditionally; Electron
 * users will see it in the dev preview only.
 */
import { useEffect } from "react";
import { useHasAnyDirty } from "@/hooks/useDraftRegistry";

export function useBeforeUnloadGuard(): void {
  const hasAny = useHasAnyDirty();
  useEffect(() => {
    if (!hasAny) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chromium ignores custom strings; setting returnValue triggers the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => { window.removeEventListener("beforeunload", handler); };
  }, [hasAny]);
}
