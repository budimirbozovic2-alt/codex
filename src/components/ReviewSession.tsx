import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { addActivityEntry } from "@/lib/metacognitive-storage";
import { logger } from "@/lib/logger";
import { ReviewMode, DueItem, ViewWidth, ReviewSessionProps } from "./review/review-constants";
import { buildItemsForMode } from "@/lib/review-mode-builder";
import ReviewSetup from "./review/ReviewSetup";
import ReviewCard from "./review/ReviewCard";
import ReviewComplete from "./review/ReviewComplete";
import {
  loadSavedReviewSession,
  saveReviewSession,
  clearSavedReviewSession,
  type SavedReviewSession,
} from "@/lib/review-session-storage";

type SavedSessionState = SavedReviewSession;


export default function ReviewSession({ dueCards, allCards, categoryRecords, srSettings, onReviewSection, onLogError, onBack, lockedCategory, autoMode }: ReviewSessionProps) {
  const [mode, setMode] = useState<ReviewMode>(null);
  const [items, setItems] = useState<DueItem[]>([]);
  const [randomIndex, setRandomIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [savedSession, setSavedSession] = useState<SavedSessionState | null>(null);
  const reviewStartRef = useRef(Date.now());

  // Check for saved session on mount (storage module owns IDB + migration)
  useEffect(() => {
    (async () => {
      const state = await loadSavedReviewSession();
      if (state) setSavedSession(state);
    })();
  }, []);

  const clearSavedSession = useCallback(() => {
    void clearSavedReviewSession();
  }, []);

  // Log activity when session finishes
  useEffect(() => {
    if (finished) {
      addActivityEntry({ timestamp: Date.now(), type: "review", durationMs: Date.now() - reviewStartRef.current });
      clearSavedSession();
    }
  }, [finished, clearSavedSession]);

  // Save session state for pause/resume.
  // PR-H2: await persistence and surface failures via toast so a failed
  // pause-save doesn't silently drop the resume slot.
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
    onBack();
  }, [saveSessionState, onBack]);

  // C3 fix: Recompute items when resuming so currentItem is never undefined
  // Centralized via review-mode-builder so the picker (ReviewSetup) and
  // the live session (resume / autoMode) always agree on contents.
  const computeItemsForMode = useCallback((m: Exclude<ReviewMode, null>): DueItem[] => {
    return buildItemsForMode(m, { dueCards, allCards, srSettings });
  }, [dueCards, allCards, srSettings]);

  // Auto-start in a specific mode when the caller passes ?mode=… via the URL,
  // skipping ReviewSetup entirely. Runs once when autoMode is set and no mode
  // has been chosen yet.
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
    clearSavedSession();
  }, [autoMode, mode, computeItemsForMode, clearSavedSession]);

  const resumeSession = useCallback(() => {
    if (!savedSession) return;
    let resumeMode: ReviewMode = savedSession.mode;
    const modeStr = resumeMode as string;
    if (modeStr === "essay") resumeMode = "stabilization";
    else if (modeStr === "random") resumeMode = "critical";
    else if (modeStr === "difficult") resumeMode = "hardest";
    if (resumeMode === null) return; // legacy / corrupt state — ignore
    const resumeItems = computeItemsForMode(resumeMode);
    const safeIndex = Math.min(savedSession.randomIndex || 0, Math.max(0, resumeItems.length - 1));
    setMode(resumeMode);
    setItems(resumeItems);
    setRandomIndex(safeIndex);
    setSavedSession(null);
    clearSavedSession();
  }, [savedSession, clearSavedSession, computeItemsForMode]);

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
    clearSavedSession();
  }, [clearSavedSession]);

  // ── Setup phase ──
  if (mode === null) {
    return (
      <ReviewSetup
        dueCards={dueCards}
        allCards={allCards}
        categoryRecords={categoryRecords}
        subcategories={{}}
        srSettings={srSettings}
        onSelectMode={handleSelectMode}
        onBack={onBack}
        savedSession={savedSession}
        onResumeSession={resumeSession}
        onClearSavedSession={() => { setSavedSession(null); clearSavedSession(); }}
        lockedCategory={lockedCategory}
      />
    );
  }

  // ── Active review ──
  const currentItem = items[randomIndex];

  const handleGrade = (grade: number) => {
    if (!currentItem) return;
    onReviewSection(currentItem.card.id, currentItem.section.id, grade);
    if (randomIndex + 1 < items.length) {
      setRandomIndex((i) => i + 1);
      setShowAnswer(false);
    } else {
      setFinished(true);
    }
  };

  if (finished || !currentItem) {
    return <ReviewComplete onBack={onBack} />;
  }

  const modeBadge = mode === "stabilization"
    ? { label: "Stabilizacija", className: "bg-primary/10 text-primary" }
    : mode === "critical"
    ? { label: "Zadržavanje", className: "bg-warning/10 text-warning" }
    : { label: "Najteže", className: "bg-destructive/10 text-destructive" };

  return (
    <ReviewCard
      card={currentItem.card}
      section={currentItem.section}
      showAnswer={showAnswer}
      setShowAnswer={setShowAnswer}
      onGrade={handleGrade}
      onLogError={onLogError}
      onBack={autoMode ? onBack : () => setMode(null)}
      onPause={handlePauseSession}
      progress={randomIndex}
      total={items.length}
      sectionIndex={0}
      totalSectionsInCard={1}
      srSettings={srSettings}
      viewWidth={viewWidth}
      onViewWidthChange={setViewWidth}
      modeBadge={modeBadge}
    />
  );
}
