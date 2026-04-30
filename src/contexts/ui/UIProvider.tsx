import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/lib/spaced-repetition";
import { recordAppEntry } from "@/lib/metacognitive-storage";
import { useCardActions } from "../cards/CardProvider";
import { useCurrentView, VIEW_TO_PATH, type View } from "../routing/useCurrentView";
import { useNotificationScheduler } from "./useNotificationScheduler";
import { useActivityTracker } from "./useActivityTracker";

interface UIContextValue {
  view: View;
  setView: (v: View) => void;
  editingCard: Card | null;
  setEditingCard: (c: Card | null) => void;
  handleToggleTag: (cardId: string, tag: string) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUIContext() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUIContext must be used within UIProvider");
  return ctx;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const { toggleTag } = useCardActions();
  const navigate = useNavigate();
  const view = useCurrentView();

  const [editingCard, setEditingCard] = useState<Card | null>(null);

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
    view, setView, editingCard, setEditingCard, handleToggleTag,
  }), [view, setView, editingCard, handleToggleTag]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
