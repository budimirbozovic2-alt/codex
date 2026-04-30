import { useState, useEffect, useCallback, useRef } from "react";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { addActivityEntry } from "@/lib/metacognitive-storage";
import { idbLoadSettings, idbSaveSettings } from "@/lib/db";
import { ReviewMode, DueItem, ViewWidth, ReviewSessionProps } from "./review/review-constants";
import { buildItemsForMode } from "@/lib/review-mode-builder";
import ReviewSetup from "./review/ReviewSetup";
import ReviewCard from "./review/ReviewCard";
import ReviewComplete from "./review/ReviewComplete";

const SESSION_KEY = "sr-review-session";

interface SavedSessionState {
  mode: ReviewMode;
  randomIndex: number;
  timestamp: number;
}

export default function ReviewSession({ dueCards, allCards, categoryRecords, srSettings, onReviewSection, onLogError, onBack, lockedCategory, autoMode }: ReviewSessionProps) {
  const [mode, setMode] = useState<ReviewMode>(null);
  const [items, setItems] = useState<DueItem[]>([]);
  const [randomIndex, setRandomIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [savedSession, setSavedSession] = useState<SavedSessionState | null>(null);
  const reviewStartRef = useRef(Date.now());

  // Check for saved session on mount (IDB with localStorage migration)
  useEffect(() => {
    (async () => {
      let state = await idbLoadSettings<SavedSessionState | null>(SESSION_KEY, null);
      // Migrate from localStorage if IDB empty
      if (!state) {
        try {
          const raw = localStorage.getItem(SESSION_KEY);
          if (raw) {
            state = JSON.parse(raw) as SavedSessionState;
            await idbSaveSettings(SESSION_KEY, state);
            localStorage.removeItem(SESSION_KEY);
          }
        } catch (e) { console.debug("[ReviewSession] session restore failed", e); }
      }
      if (
        state && typeof state === "object" &&
        typeof state.timestamp === "number" && Number.isFinite(state.timestamp) &&
        Date.now() - state.timestamp < 2 * 60 * 60 * 1000
      ) {
        setSavedSession(state);
      } else if (state) {
        await idbSaveSettings(SESSION_KEY, null);
      }
    })();
  }, []);

  const clearSavedSession = useCallback(() => {
    idbSaveSettings(SESSION_KEY, null).catch(() => {});
  }, []);

  // Log activity when session finishes
  useEffect(() => {
    if (finished) {
      addActivityEntry({ timestamp: Date.now(), type: "review", durationMs: Date.now() - reviewStartRef.current });
      clearSavedSession();
    }
  }, [finished, clearSavedSession]);

  // Save session state for pause/resume
  const saveSessionState = useCallback(() => {
    if (mode === null || finished) return;
    const state: SavedSessionState = { mode, randomIndex, timestamp: Date.now() };
    idbSaveSettings(SESSION_KEY, state).catch(() => {});
  }, [mode, randomIndex, finished]);

  const handlePauseSession = useCallback(() => {
    saveSessionState();
    onBack();
  }, [saveSessionState, onBack]);

  // C3 fix: Recompute items when resuming so currentItem is never undefined
  // Centralized via review-mode-builder so the picker (ReviewSetup) and
  // the live session (resume / autoMode) always agree on contents.
  const computeItemsForMode = useCallback((m: Exclude<ReviewMode, null>): DueItem[] => {
    return buildItemsForMode(m, { dueCards, allCards, srSettings });
  }, [dueCards, allCards, srSettings]);

  // Auto-start in a specific mode (e.g. global dashboard's "Globalna konsolidacija"
  // forces `critical`). Skips ReviewSetup entirely. Runs once when autoMode is set
  // and no mode has been chosen yet.
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
