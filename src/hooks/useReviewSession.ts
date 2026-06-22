import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { addActivityEntry } from "@/domains/metacognition/metacognitive-storage";
import { logger } from "@/lib/logger";
import type { ReviewMode } from "@/domains/review/types";
import { DueItem, ViewWidth, ReviewSessionProps } from "@/components/review/review-constants";
import { buildItemsForMode } from "@/lib/review-mode-builder";
import { setImmersiveMode } from "@/store/useUIStore";
import { useSessionDiscipline } from "@/hooks/planner/useSessionDiscipline";
import {
  loadSavedReviewSession,
  saveReviewSession,
  clearSavedReviewSession,
  type SavedReviewSession,
} from "@/domains/review/review-session-storage";

type SavedSessionState = SavedReviewSession;

export function useReviewSession({
  dueCards,
  allCards,
  categoryRecords,
  srSettings,
  reviewLog,
  onReviewSection,
  onLogError,
  onBack,
  lockedCategory,
  autoMode,
}: ReviewSessionProps) {
  const [mode, setMode] = useState<ReviewMode>(null);
  const [items, setItems] = useState<DueItem[]>([]);
  const [randomIndex, setRandomIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [savedSession, setSavedSession] = useState<SavedSessionState | null>(null);
  const [savedSessionLoading, setSavedSessionLoading] = useState(true);
  const reviewStartRef = useRef(Date.now());
  const sessionGradesRef = useRef<number[]>([]);
  const { trackSection, resetSession, recordAfterSession } = useSessionDiscipline();

  useEffect(() => {
    setImmersiveMode(mode !== null);
    return () => { setImmersiveMode(false); };
  }, [mode]);

  const lockedCategoryName = useMemo(() => {
    if (!lockedCategory) return undefined;
    return categoryRecords.find(c => c.id === lockedCategory)?.name;
  }, [lockedCategory, categoryRecords]);

  const persistSessionDiscipline = useCallback(() => {
    recordAfterSession({
      reviewLog,
      cards: allCards,
      elapsedMs: Date.now() - reviewStartRef.current,
    });
  }, [recordAfterSession, reviewLog, allCards]);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const persistRef = useRef(persistSessionDiscipline);
  persistRef.current = persistSessionDiscipline;

  useEffect(() => {
    return () => {
      if (modeRef.current !== null) persistRef.current();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const state = await loadSavedReviewSession();
        if (state) setSavedSession(state);
      } finally {
        setSavedSessionLoading(false);
      }
    })();
  }, []);

  const clearSavedSession = useCallback(() => {
    void clearSavedReviewSession();
  }, []);

  useEffect(() => {
    if (!finished) return;
    const elapsedMs = Date.now() - reviewStartRef.current;
    addActivityEntry({ timestamp: Date.now(), type: "review", durationMs: elapsedMs });
    persistSessionDiscipline();
    clearSavedSession();
  }, [finished, clearSavedSession, persistSessionDiscipline]);

  const saveSessionState = useCallback(async (): Promise<void> => {
    if (mode === null || finished) return;
    const state: SavedSessionState = { mode, randomIndex, timestamp: Date.now() };
    try {
      await saveReviewSession(state);
    } catch (err) {
      toast.error("Snimanje pauze nije uspjelo — sesija neće biti obnovljena.");
      logger.error("[ReviewSession] saveReviewSession failed", err);
    }
  }, [mode, randomIndex, finished]);

  const handlePauseSession = useCallback(() => {
    void saveSessionState();
    persistSessionDiscipline();
    onBack();
  }, [saveSessionState, persistSessionDiscipline, onBack]);

  const handleExitSession = useCallback(() => {
    persistSessionDiscipline();
    onBack();
  }, [persistSessionDiscipline, onBack]);

  const handleBackToSetup = useCallback(() => {
    persistSessionDiscipline();
    resetSession();
    setMode(null);
  }, [persistSessionDiscipline, resetSession]);

  const computeItemsForMode = useCallback((m: Exclude<ReviewMode, null>): DueItem[] => {
    return buildItemsForMode(m, { dueCards, allCards, srSettings });
  }, [dueCards, allCards, srSettings]);

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoMode || autoStartedRef.current || mode !== null) return;
    autoStartedRef.current = true;
    const computed = computeItemsForMode(autoMode);
    setMode(autoMode);
    setItems(computed);
    setRandomIndex(0);
    setShowAnswer(false);
    setFinished(false);
    setSavedSession(null);
    reviewStartRef.current = Date.now();
    sessionGradesRef.current = [];
    resetSession();
    clearSavedSession();
  }, [autoMode, mode, computeItemsForMode, clearSavedSession, resetSession]);

  const resumeSession = useCallback(() => {
    if (!savedSession) return;
    let resumeMode: ReviewMode = savedSession.mode;
    const modeStr = resumeMode as string;
    if (modeStr === "essay") resumeMode = "stabilization";
    else if (modeStr === "random") resumeMode = "critical";
    else if (modeStr === "difficult") resumeMode = "hardest";
    if (resumeMode === null) return;
    const resumeItems = computeItemsForMode(resumeMode);
    const safeIndex = Math.min(savedSession.randomIndex || 0, Math.max(0, resumeItems.length - 1));
    setMode(resumeMode);
    setItems(resumeItems);
    setRandomIndex(safeIndex);
    setSavedSession(null);
    reviewStartRef.current = Date.now();
    sessionGradesRef.current = [];
    resetSession();
    clearSavedSession();
  }, [savedSession, clearSavedSession, computeItemsForMode, resetSession]);

  const handleSelectMode = useCallback((
    selectedMode: ReviewMode,
    _cat: string | null,
    _sub: string | null,
    _chapter: string | null,
    _examFreq: boolean,
    _fType: "all" | "essay" | "flash",
    computedItems: DueItem[],
  ) => {
    setMode(selectedMode);
    setItems(computedItems);
    setRandomIndex(0);
    setShowAnswer(false);
    setFinished(false);
    reviewStartRef.current = Date.now();
    sessionGradesRef.current = [];
    resetSession();
    clearSavedSession();
  }, [clearSavedSession, resetSession]);

  const handleClearSavedSession = useCallback(() => {
    setSavedSession(null);
    clearSavedSession();
  }, [clearSavedSession]);

  const currentItem = mode !== null ? items[randomIndex] : undefined;

  const handleGrade = useCallback((grade: number) => {
    if (!currentItem) return;
    sessionGradesRef.current.push(grade);
    trackSection(currentItem.card.id, currentItem.section.id);
    onReviewSection(currentItem.card.id, currentItem.section.id, grade);
    if (randomIndex + 1 < items.length) {
      setRandomIndex((i) => i + 1);
      setShowAnswer(false);
    } else {
      setFinished(true);
    }
  }, [currentItem, randomIndex, items.length, trackSection, onReviewSection]);

  const modeBadge = mode === "stabilization"
    ? { label: "Stabilizacija", className: "bg-primary/10 text-primary" }
    : mode === "critical"
    ? { label: "Zadržavanje", className: "bg-warning/10 text-warning" }
    : { label: "Najteže", className: "bg-destructive/10 text-destructive" };

  const cardSections = currentItem?.card.sections ?? [];
  const sectionIndex = currentItem
    ? Math.max(0, cardSections.findIndex(s => s.id === currentItem.section.id))
    : 0;
  const totalSectionsInCard = cardSections.length;

  return {
    mode,
    finished,
    savedSessionLoading,
    savedSession,
    dueCards,
    allCards,
    categoryRecords,
    srSettings,
    onLogError,
    onBack,
    lockedCategory,
    autoMode,
    lockedCategoryName,
    handleSelectMode,
    resumeSession,
    handleClearSavedSession,
    currentItem,
    showAnswer,
    setShowAnswer,
    handleGrade,
    handlePauseSession,
    handleExitSession,
    handleBackToSetup,
    randomIndex,
    items,
    viewWidth,
    setViewWidth,
    modeBadge,
    sectionIndex,
    totalSectionsInCard,
    reviewStartTime: reviewStartRef.current,
    sessionGrades: sessionGradesRef.current,
  };
}
