import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface ForumContextValue {
  unlocked: boolean;
  showTransition: boolean;
  enterForum: () => void;
  exitForum: () => void;
  forumReady: () => void;
}

const ForumCtx = createContext<ForumContextValue | null>(null);

const LS_KEY = "codex-forum-unlocked";

export function ForumProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(LS_KEY) === "1");
  const [showTransition, setShowTransition] = useState(false);

  const enterForum = useCallback(() => {
    localStorage.setItem(LS_KEY, "1");
    setUnlocked(true);
    setShowTransition(true);
  }, []);

  const exitForum = useCallback(() => {
    // Navigation handled by the component calling this
    setShowTransition(false);
  }, []);

  const forumReady = useCallback(() => {
    setShowTransition(false);
  }, []);

  return (
    <ForumCtx.Provider value={{ unlocked, showTransition, enterForum, exitForum, forumReady }}>
      {children}
    </ForumCtx.Provider>
  );
}

export function useForumContext() {
  const ctx = useContext(ForumCtx);
  if (!ctx) throw new Error("useForumContext must be used within ForumProvider");
  return ctx;
}
