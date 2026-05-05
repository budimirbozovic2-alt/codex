import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { recordAppEntry } from "@/lib/metacognitive-storage";
import { useCardOnlyActions } from "../cards/CardProvider";
import { useCurrentView, VIEW_TO_PATH, type View } from "../routing/useCurrentView";
import { useNotificationScheduler } from "./useNotificationScheduler";
import { useActivityTracker } from "./useActivityTracker";

interface UIContextValue {
  view: View;
  setView: (v: View) => void;
  /** UUID-only edit target. EditPage resolves the live Card from cardMap on render. */
  editingCardId: string | null;
  setEditingCardId: (id: string | null) => void;
  handleToggleTag: (cardId: string, tag: string) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

const UI_FALLBACK: UIContextValue = {
  view: "dashboard" as View,
  setView: () => {},
  editingCardId: null,
  setEditingCardId: () => {},
  handleToggleTag: () => {},
};

// M3: Synchronous SSOT mirror of `editingCardId`. The React state above is
// the authoritative value for renders, but this slot lets non-React (or
// just-after-setState) consumers read the latest id without each component
// keeping its own ref. `useEditReturn` consults this when no `cardId` is
// supplied, so `setEditingCardId(id)` followed by `stash()` always records
// the freshest id, even from a stale closure.
let _currentEditingCardId: string | null = null;
export function getCurrentEditingCardId(): string | null {
  return _currentEditingCardId;
}

export function useUIContext() {
  const ctx = useContext(UIContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn("[useUIContext] no provider — returning fallback (HMR transient)");
      return UI_FALLBACK;
    }
    throw new Error("useUIContext must be used within UIProvider");
  }
  return ctx;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const { toggleTag } = useCardOnlyActions();
  const navigate = useNavigate();
  const view = useCurrentView();

  const [editingCardId, _setEditingCardId] = useState<string | null>(null);
  const setEditingCardId = useCallback((id: string | null) => {
    _currentEditingCardId = id;
    _setEditingCardId(id);
  }, []);

  useEffect(() => { recordAppEntry(); }, []);

  useNotificationScheduler();
  useActivityTracker(view);

  const setView = useCallback((v: View) => {
    navigate(VIEW_TO_PATH[v]);
  }, [navigate]);

  const handleToggleTag = useCallback((cardId: string, tag: string) => {
    toggleTag(cardId, tag);
  }, [toggleTag]);

  const value = useMemo<UIContextValue>(() => ({
    view, setView, editingCardId, setEditingCardId, handleToggleTag,
  }), [view, setView, editingCardId, setEditingCardId, handleToggleTag]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
