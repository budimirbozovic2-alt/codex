/**
 * Provider Cleanup v3 — `UIProvider` no-op shim removed.
 *
 * Transient UI state (`editingCardId`) lives in `@/store/useUIStore`.
 * Side-effects (notifications scheduler, activity tracker, recordAppEntry)
 * are mounted in `<AppBootstrap />`. `view` stays derived from the route
 * via `useCurrentView()`. `setView` is a thin navigate wrapper.
 *
 * `useUIContext()` is kept as a drop-in composite hook for existing call
 * sites — marked deprecated for follow-up migration to direct store reads.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import {
  uiStore,
  setEditingCardId as setEditingCardIdAction,
  getCurrentEditingCardId,
} from "@/store/useUIStore";
import { useCurrentView, VIEW_TO_PATH, type View } from "./useCurrentView";
import { useCardOnlyActions } from "./cards/useActions";

// Re-export sync helpers — used by `useEditReturn` and tests.
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

