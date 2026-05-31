// ─────────────────────────────────────────────────────────────────────────────
// useSessionStore — Zustand atom for in-progress learn/review sessions.
//
// Replaces the React `SessionProvider` Context. Buffers grade/error/markRead
// actions during a session, takes an immutable snapshot of cards+log at
// session start, and tracks `isProcessing` derived from `isEnding ||
// persistQueue.hasPending()` so the UI stays in "spremanje" until writes
// drain.
//
// Module-level subscription on `persistQueue` wires `queuePending` once at
// first import — no React mount needed.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { persistQueue } from "@/lib/persist-queue";
import { logger } from "@/lib/logger";

export interface QueuedReview {
  cardId: string;
  sectionId: string;
  grade: number;
  timestamp: number;
}
export interface QueuedError { cardId: string; text: string }
export interface QueuedMarkRead { cardId: string }

export interface SessionSnapshot {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
}

interface SessionState {
  isSessionActive: boolean;
  isEnding: boolean;
  queuePending: boolean;
  snapshot: SessionSnapshot | null;
  reviewQueue: QueuedReview[];
  errorQueue: QueuedError[];
  readQueue: QueuedMarkRead[];
  queueSize: number;
}

const initialState: SessionState = {
  isSessionActive: false,
  isEnding: false,
  queuePending: false,
  snapshot: null,
  reviewQueue: [],
  errorQueue: [],
  readQueue: [],
  queueSize: 0,
};

export const sessionStore = create<SessionState>(() => ({ ...initialState }));

// ─── Module-level persistQueue subscription ─────────────────────────────
let _wired = false;
function wirePersistQueue(): void {
  if (_wired) return;
  _wired = true;
  const update = () => sessionStore.setState({ queuePending: persistQueue.hasPending() });
  update();
  persistQueue.subscribe(update);
}
if (typeof window !== "undefined") wirePersistQueue();

// ─── Actions (module-level, stable references) ──────────────────────────
export function startSession(cards: Card[], reviewLog: ReviewLogEntry[]): void {
  sessionStore.setState({
    snapshot: { cards: [...cards], reviewLog: [...reviewLog] },
    reviewQueue: [],
    errorQueue: [],
    readQueue: [],
    queueSize: 0,
    isSessionActive: true,
  });
}

export async function endSession(
  flushReviews: (reviews: QueuedReview[]) => void,
  flushErrors: (errors: QueuedError[]) => void,
  flushReads: (reads: QueuedMarkRead[]) => void,
): Promise<void> {
  const s = sessionStore.getState();
  const reviews = [...s.reviewQueue];
  const errors = [...s.errorQueue];
  const reads = [...s.readQueue];

  sessionStore.setState({
    isSessionActive: false,
    isEnding: true,
    reviewQueue: [],
    errorQueue: [],
    readQueue: [],
    queueSize: 0,
  });

  if (reviews.length > 0) flushReviews(reviews);
  if (errors.length > 0) flushErrors(errors);
  if (reads.length > 0) flushReads(reads);

  try {
    await persistQueue.flush();
  } catch (err: unknown) {
    logger.warn("[session] persist flush failed", err);
  }

  sessionStore.setState({ isEnding: false });

  // Drop snapshot once nothing is in flight.
  const post = sessionStore.getState();
  if (!post.isEnding && !post.queuePending && !post.isSessionActive && post.snapshot) {
    sessionStore.setState({ snapshot: null });
  }
}

export function queueReview(cardId: string, sectionId: string, grade: number): void {
  sessionStore.setState((s) => ({
    reviewQueue: [...s.reviewQueue, { cardId, sectionId, grade, timestamp: Date.now() }],
    queueSize: s.queueSize + 1,
  }));
}
export function queueError(cardId: string, text: string): void {
  sessionStore.setState((s) => ({
    errorQueue: [...s.errorQueue, { cardId, text }],
    queueSize: s.queueSize + 1,
  }));
}
export function queueMarkRead(cardId: string): void {
  sessionStore.setState((s) => ({
    readQueue: [...s.readQueue, { cardId }],
    queueSize: s.queueSize + 1,
  }));
}

// ─── Drop-in hook (matches old `useSessionContext()` shape) ─────────────
export interface SessionApi {
  isSessionActive: boolean;
  isProcessing: boolean;
  snapshot: SessionSnapshot | null;
  startSession: typeof startSession;
  endSession: typeof endSession;
  queueReview: typeof queueReview;
  queueError: typeof queueError;
  queueMarkRead: typeof queueMarkRead;
  queueSize: number;
}

export function useSessionContext(): SessionApi {
  const slice = sessionStore(
    useShallow((s) => ({
      isSessionActive: s.isSessionActive,
      isProcessing: s.isEnding || s.queuePending,
      snapshot: s.snapshot,
      queueSize: s.queueSize,
    })),
  );
  return {
    ...slice,
    startSession,
    endSession,
    queueReview,
    queueError,
    queueMarkRead,
  };
}

export function __resetSessionStoreForTests(): void {
  sessionStore.setState({ ...initialState });
}
