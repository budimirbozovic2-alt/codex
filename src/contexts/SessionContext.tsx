import { createContext, useContext, useState, useCallback, useRef, useMemo, ReactNode } from "react";
import { Card } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";

// ─── Types ──────────────────────────────────────────────
export interface QueuedReview {
  cardId: string;
  sectionId: string;
  grade: number;
  timestamp: number;
}

export interface QueuedError {
  cardId: string;
  text: string;
}

export interface QueuedMarkRead {
  cardId: string;
}

interface SessionSnapshot {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
}

interface SessionContextValue {
  /** True when user is in an active learn/review session */
  isSessionActive: boolean;
  /** True when post-session processing is running */
  isProcessing: boolean;
  /** Snapshot of cards/log taken at session start — use for display during session */
  snapshot: SessionSnapshot | null;
  /** Start a session — takes a snapshot of current data */
  startSession: (cards: Card[], reviewLog: ReviewLogEntry[]) => void;
  /** End session — flushes queued actions and triggers processing indicator */
  endSession: (
    flushReviews: (reviews: QueuedReview[]) => void,
    flushErrors: (errors: QueuedError[]) => void,
    flushReads: (reads: QueuedMarkRead[]) => void,
  ) => void;
  /** Queue a review grade (buffered until session ends) */
  queueReview: (cardId: string, sectionId: string, grade: number) => void;
  /** Queue an error log (buffered until session ends) */
  queueError: (cardId: string, text: string) => void;
  /** Queue a markRead (buffered until session ends) */
  queueMarkRead: (cardId: string) => void;
  /** Number of queued actions in current session */
  queueSize: number;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be used within SessionProvider");
  return ctx;
}

// Processing duration (visual indicator)
const PROCESSING_DURATION_MS = 2500;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);

  const reviewQueue = useRef<QueuedReview[]>([]);
  const errorQueue = useRef<QueuedError[]>([]);
  const readQueue = useRef<QueuedMarkRead[]>([]);
  const [queueSize, setQueueSize] = useState(0);

  const startSession = useCallback((cards: Card[], reviewLog: ReviewLogEntry[]) => {
    // Take immutable snapshot
    setSnapshot({ cards: [...cards], reviewLog: [...reviewLog] });
    reviewQueue.current = [];
    errorQueue.current = [];
    readQueue.current = [];
    setQueueSize(0);
    setIsSessionActive(true);
  }, []);

  const endSession = useCallback(async (
    flushReviews: (reviews: QueuedReview[]) => void,
    flushErrors: (errors: QueuedError[]) => void,
    flushReads: (reads: QueuedMarkRead[]) => void,
  ) => {
    setIsSessionActive(false);
    setIsProcessing(true);

    // Flush all queued actions to main state
    const reviews = [...reviewQueue.current];
    const errors = [...errorQueue.current];
    const reads = [...readQueue.current];

    reviewQueue.current = [];
    errorQueue.current = [];
    readQueue.current = [];
    setQueueSize(0);

    // Apply all queued mutations
    if (reviews.length > 0) flushReviews(reviews);
    if (errors.length > 0) flushErrors(errors);
    if (reads.length > 0) flushReads(reads);

    // G2 fix: wait for actual persist flush, then show brief indicator
    try {
      const { persistQueue } = await import("@/lib/persist-queue");
      await persistQueue.flush();
    } catch (e) {
      console.warn("[session] persist flush failed", e);
    }

    // Brief visual indicator after flush completes
    setTimeout(() => {
      setIsProcessing(false);
      setSnapshot(null);
    }, 600);
  }, []);

  const queueReview = useCallback((cardId: string, sectionId: string, grade: number) => {
    reviewQueue.current.push({ cardId, sectionId, grade, timestamp: Date.now() });
    setQueueSize(prev => prev + 1);
  }, []);

  const queueError = useCallback((cardId: string, text: string) => {
    errorQueue.current.push({ cardId, text });
    setQueueSize(prev => prev + 1);
  }, []);

  const queueMarkRead = useCallback((cardId: string) => {
    readQueue.current.push({ cardId });
    setQueueSize(prev => prev + 1);
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    isSessionActive,
    isProcessing,
    snapshot,
    startSession,
    endSession,
    queueReview,
    queueError,
    queueMarkRead,
    queueSize,
  }), [isSessionActive, isProcessing, snapshot, startSession, endSession, queueReview, queueError, queueMarkRead, queueSize]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
