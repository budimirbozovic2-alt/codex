import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, ReactNode } from "react";
import { Card } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { persistQueue } from "@/lib/persist-queue";

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
  /** End session — flushes queued actions and awaits persist */
  endSession: (
    flushReviews: (reviews: QueuedReview[]) => void,
    flushErrors: (errors: QueuedError[]) => void,
    flushReads: (reads: QueuedMarkRead[]) => void,
  ) => Promise<void>;
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

// Processing indicator duration reduced — actual wait is on persist flush

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isSessionActive, setIsSessionActive] = useState(false);
  // `isEnding` is the local intent ("user pressed End"); the visible
  // `isProcessing` indicator is derived from `isEnding || persistQueue.hasPending()`
  // so it stays on until the queue actually drains — no arbitrary setTimeout
  // padding, no risk of hiding while writes are still in flight.
  const [isEnding, setIsEnding] = useState(false);
  const [queuePending, setQueuePending] = useState(false);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);

  useEffect(() => {
    const update = () => setQueuePending(persistQueue.hasPending());
    update();
    return persistQueue.subscribe(update);
  }, []);

  const isProcessing = isEnding || queuePending;

  // Drop the snapshot once both flags are clear. Effect, not setTimeout —
  // fires synchronously on the commit that flips both to false.
  useEffect(() => {
    if (!isEnding && !queuePending && snapshot && !isSessionActive) {
      setSnapshot(null);
    }
  }, [isEnding, queuePending, snapshot, isSessionActive]);

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
    setIsEnding(true);

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

    // Wait for persist queue to drain. `isProcessing` stays true via the
    // queue subscription above until the last write resolves.
    try {
      await persistQueue.flush();
    } catch (err: unknown) {
      logger.warn("[session] persist flush failed", err);
    }


    setIsEnding(false);
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
