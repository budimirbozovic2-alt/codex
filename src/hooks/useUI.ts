/**
 * Provider Cleanup v2 — `UIProvider` is a no-op shim.
 *
 * Transient UI state (`editingCardId`) lives in `@/store/useUIStore`.
 * Side-effects (notifications scheduler, activity tracker, recordAppEntry)
 * moved to `<AppBootstrap />`. `view` stays derived from the route via
 * `useCurrentView()`. `setView` becomes a thin navigate wrapper.
 *
 * `useUIContext()` is kept as a drop-in composite hook for the existing
 * 8 call sites — marked deprecated for follow-up migration to direct
 * store reads.
 */
import { useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import {
  uiStore,
  setEditingCardId as setEditingCardIdAction,
  getCurrentEditingCardId,
} from "@/store/useUIStore";
import { useCurrentView, VIEW_TO_PATH, type View } from "../routing/useCurrentView";
import { useCardOnlyActions } from "../cards/useActions";

// Re-export sync helpers under the legacy path for back-compat. Tests and
// `useEditReturn` import these from `@/contexts/ui/UIProvider`.
export { getCurrentEditingCardId };
export function setEditingCardId(id: string | null): void {
  setEditingCardIdAction(id);
}

interface UIContextValue {
  view: View;
  setView: (v: View) => void;
  editingCardId: string | null;
  setEditingCardId: (id: string | null) => void;
  handleToggleTag: (cardId: string, tag: string) => void;
}

/**
 * @deprecated Composite shim. New code should read `editingCardId` from
 * `@/store/useUIStore` and use `useCurrentView()` + `useNavigate()` directly.
 */
export function useUIContext(): UIContextValue {
  const view = useCurrentView();
  const navigate = useNavigate();
  const editingCardId = useStore(uiStore, (s) => s.editingCardId);
  const { toggleTag } = useCardOnlyActions();

  const setView = useCallback((v: View) => { navigate(VIEW_TO_PATH[v]); }, [navigate]);
  const setEditingId = useCallback((id: string | null) => { setEditingCardIdAction(id); }, []);
  const handleToggleTag = useCallback((cardId: string, tag: string) => { toggleTag(cardId, tag); }, [toggleTag]);

  return { view, setView, editingCardId, setEditingCardId: setEditingId, handleToggleTag };
}

/** @deprecated Provider removed in v2 cleanup. Kept as no-op shim. */
export function UIProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
