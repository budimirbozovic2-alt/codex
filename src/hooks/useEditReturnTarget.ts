import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { consumeEditReturn } from "@/lib/edit-return";
import { useUIContext } from "@/contexts/AppContext";

interface UseEditReturnTargetApi {
  /** Navigate to the stashed return path, or fall back to dashboard. */
  navigateBack: () => void;
}

/**
 * Companion to `useEditReturn`. Used inside EditPage (or any consumer view
 * that needs to send the user back to wherever they came from).
 *
 * Reads `consumeEditReturn` exactly once on mount and exposes a stable
 * `navigateBack()` callback.
 */
export function useEditReturnTarget(): UseEditReturnTargetApi {
  const navigate = useNavigate();
  const { setView } = useUIContext();
  const returnPathRef = useRef<string | null>(null);

  useEffect(() => {
    const ctx = consumeEditReturn();
    if (ctx?.path) returnPathRef.current = ctx.path;
  }, []);

  const navigateBack = useCallback(() => {
    const path = returnPathRef.current;
    if (path) {
      navigate(path);
      return;
    }
    setView("dashboard"); // safe fallback when no caller stashed a return
  }, [navigate, setView]);

  return { navigateBack };
}
