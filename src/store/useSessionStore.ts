// ─────────────────────────────────────────────────────────────────────────────
// useSessionStore — Zustand atom for in-progress learn/review sessions.
//
// Replaces the React `SessionProvider` Context. Buffers grade/error/markRead
// actions during a session, takes an immutable snapshot of cards+log at
// session start, and tracks `isProcessing` as `isEnding || pendingMutations`
// so the UI stays in "spremanje" until session flush and in-flight writes drain.
// ─────────────────────────────────────────────────────────────────────────────
import { useMutationState } from "@tanstack/react-query";
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
  const deadline = Date.now() + timeoutMs;
  while (queryClient.isMutating() > 0) {
    if (Date.now() >= deadline) {
      logger.warn("[session] pending mutations drain timeout");
      return;
    }
    await new Promise<void>((resolve) => {
      taskScheduler.setTimeout(() => resolve(), 16, { label: "session:mutation-drain-poll" });
    });
  }
}

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
  snapshot: SessionSnapshot | null;
  reviewQueue: QueuedReview[];
  errorQueue: QueuedError[];
  readQueue: QueuedMarkRead[];
  queueSize: number;
}

const initialState: SessionState = {
  isSessionActive: false,
  isEnding: false,
  snapshot: null,
  reviewQueue: [],
  errorQueue: [],
  readQueue: [],
  queueSize: 0,
};

export const sessionStore = create<SessionState>(() => ({ ...initialState }));

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
  const pendingMutations = useMutationState({
    filters: { status: "pending" },
    select: () => 1,
  }).length;

  const slice = sessionStore(
    useShallow((s) => ({
      isSessionActive: s.isSessionActive,
      isEnding: s.isEnding,
      snapshot: s.snapshot,
      queueSize: s.queueSize,
    })),
  );

  return {
    ...slice,
    isProcessing: slice.isEnding || pendingMutations > 0,
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
