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

  const [editingCardId, setEditingCardId] = useState<string | null>(null);

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
  }), [view, setView, editingCardId, handleToggleTag]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
