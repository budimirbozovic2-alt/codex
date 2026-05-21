/**
 * Mnemonic test state machine + countdown timer + queue/statistics.
 *
 * Phases: selector → reminder → test → finished.
 *
 * The countdown is driven by an interval (100ms tick, 0.1s decrement) — same
 * cadence as the original inline implementation. Pre-conditions for entering
 * each phase are enforced by the action API rather than the caller.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MnemonicCard } from "../mnemonic-storage";
import { shuffle } from "../test-tree";

export const RECALL_TIME_LIMIT = 3;

export type TestPhase = "selector" | "reminder" | "test" | "finished";

export interface SessionStats { correct: number; wrong: number; }

export interface TestEngine {
  phase: TestPhase;
  queue: MnemonicCard[];
  currentIndex: number;
  currentCard: MnemonicCard | undefined;
  showTrigger: boolean;
  timeLeft: number;
  timedOut: boolean;
  sessionStats: SessionStats;
  recallLimit: number;
  startSession: (cards: MnemonicCard[]) => void;
  enterTestPhase: () => void;
  startRecall: () => void;
  answer: (success: boolean) => void;
  gotoSelector: () => void;
}

interface Input {
  onRecordResult: (cardId: string, success: boolean) => void;
}

export function useTestEngine({ onRecordResult }: Input): TestEngine {
  const [phase, setPhase] = useState<TestPhase>("selector");
  const [queue, setQueue] = useState<MnemonicCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTrigger, setShowTrigger] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(RECALL_TIME_LIMIT);
  const [timedOut, setTimedOut] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats>({ correct: 0, wrong: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentCard = queue[currentIndex];

  useEffect(() => {
    if (!timerActive) return;
    setTimeLeft(RECALL_TIME_LIMIT);
    setTimedOut(false);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0.1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimedOut(true);
          setTimerActive(false);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive]);

  const startSession = useCallback((cards: MnemonicCard[]) => {
    setQueue(shuffle(cards));
    setCurrentIndex(0);
    setShowTrigger(false);
    setTimerActive(false);
    setTimedOut(false);
    setSessionStats({ correct: 0, wrong: 0 });
    setPhase("reminder");
  }, []);

  const enterTestPhase = useCallback(() => setPhase("test"), []);

  const startRecall = useCallback(() => {
    setShowTrigger(true);
    setTimerActive(true);
    setTimedOut(false);
  }, []);

  const answer = useCallback((success: boolean) => {
    if (!currentCard) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerActive(false);
    onRecordResult(currentCard.id, success);
    setSessionStats(prev => ({
      correct: prev.correct + (success ? 1 : 0),
      wrong: prev.wrong + (success ? 0 : 1),
    }));
    setShowTrigger(false);
    setTimedOut(false);
    if (currentIndex + 1 >= queue.length) {
      setPhase("finished");
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentCard, currentIndex, queue.length, onRecordResult]);

  const gotoSelector = useCallback(() => setPhase("selector"), []);

  return {
    phase, queue, currentIndex, currentCard,
    showTrigger, timeLeft, timedOut, sessionStats,
    recallLimit: RECALL_TIME_LIMIT,
    startSession, enterTestPhase, startRecall, answer, gotoSelector,
  };
}
