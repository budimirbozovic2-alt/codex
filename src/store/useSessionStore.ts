// ─────────────────────────────────────────────────────────────────────────────
// useSessionStore — Zustand atom for in-progress learn/review sessions.
//
// Replaces the React `SessionProvider` Context. Buffers grade/error/markRead
// actions during a session, takes an immutable snapshot of cards+log at
// session start, and tracks `isProcessing` until session flush and in-flight
// writes drain.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { queryClient } from "@/lib/query/client";
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler";

const MUTATION_DRAIN_TIMEOUT_MS = 15_000;

/** Wait until TanStack has no in-flight mutations (replaces persistQueue drain). */
async function waitForPendingMutations(timeoutMs = MUTATION_DRAIN_TIMEOUT_MS): Promise<void> {
  if (queryClient.isMutating() === 0) return;
  return new Promise<void>((resolve) => {
    const timer = taskScheduler.setTimeout(() => {
      unsubscribe();
      logger.warn("[session] pending mutations drain timeout");
      resolve();
    }, timeoutMs, { label: "session:mutation-drain-timeout" });

    const unsubscribe = queryClient.getMutationCache().subscribe(() => {
      if (queryClient.isMutating() === 0) {
        taskScheduler.cancel(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

export interface QueuedReview {
  cardId: string;
  sectionId: string;
  grade: number;
  timestamp: number;
}
export interface QueuedError { cardId: string; text: string }
export interface QueuedMarkRead { cardId: string }

interface SessionSnapshot {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
}

interface SessionState {
  isSessionActive: boolean;
  isEnding: boolean;
  isProcessing: boolean;
  snapshot: SessionSnapshot | null;
  reviewQueue: QueuedReview[];
  errorQueue: QueuedError[];
  readQueue: QueuedMarkRead[];
  queueSize: number;
}

const initialState: SessionState = {
  isSessionActive: false,
  isEnding: false,
  isProcessing: false,
  snapshot: null,
  reviewQueue: [],
  errorQueue: [],
  readQueue: [],
  queueSize: 0,
};

const sessionStore = create<SessionState>(() => ({ ...initialState }));

// ─── Actions (module-level, stable references) ──────────────────────────
function startSession(cards: Card[], reviewLog: ReviewLogEntry[]): void {
  sessionStore.setState({
    snapshot: { cards: [...cards], reviewLog: [...reviewLog] },
    reviewQueue: [],
    errorQueue: [],
    readQueue: [],
    queueSize: 0,
    isSessionActive: true,
  });
}

async function endSession(
  flushReviews: (reviews: QueuedReview[]) => void | Promise<void>,
  flushErrors: (errors: QueuedError[]) => void | Promise<void>,
  flushReads: (reads: QueuedMarkRead[]) => void | Promise<void>,
): Promise<void> {
  const s = sessionStore.getState();
  const reviews = [...s.reviewQueue];
  const errors = [...s.errorQueue];
  const reads = [...s.readQueue];

  sessionStore.setState({
    isSessionActive: false,
    isEnding: true,
    isProcessing: true,
    reviewQueue: [],
    errorQueue: [],
    readQueue: [],
    queueSize: 0,
  });

  try {
    const tasks: (void | Promise<void>)[] = [];
    if (reviews.length > 0) tasks.push(flushReviews(reviews));
    if (errors.length > 0) tasks.push(flushErrors(errors));
    if (reads.length > 0) tasks.push(flushReads(reads));
    await Promise.all(tasks);
  } catch (err: unknown) {
    logger.warn("[session] flush failed", err);
  }

  sessionStore.setState({ isEnding: false });

  await waitForPendingMutations();

  const post = sessionStore.getState();
  if (
    !post.isEnding &&
    !post.isSessionActive &&
    post.snapshot &&
    queryClient.isMutating() === 0
  ) {
    sessionStore.setState({ snapshot: null, isProcessing: false });
  } else {
    sessionStore.setState({ isProcessing: false });
  }
}

function queueReview(cardId: string, sectionId: string, grade: number): void {
  sessionStore.setState((s) => ({
    reviewQueue: [...s.reviewQueue, { cardId, sectionId, grade, timestamp: Date.now() }],
    queueSize: s.queueSize + 1,
  }));
}
function queueError(cardId: string, text: string): void {
  sessionStore.setState((s) => ({
    errorQueue: [...s.errorQueue, { cardId, text }],
    queueSize: s.queueSize + 1,
  }));
}
function queueMarkRead(cardId: string): void {
  sessionStore.setState((s) => ({
    readQueue: [...s.readQueue, { cardId }],
    queueSize: s.queueSize + 1,
  }));
}

// ─── Drop-in hook (matches old `useSessionContext()` shape) ─────────────
interface SessionApi {
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
      isProcessing: s.isProcessing,
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
