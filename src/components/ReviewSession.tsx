import { useState, useEffect, useCallback, useRef } from "react";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { addActivityEntry } from "@/lib/metacognitive-storage";
import { ReviewMode, DueItem, ViewWidth, ReviewSessionProps } from "./review/review-constants";
import ReviewSetup from "./review/ReviewSetup";
import ReviewCard from "./review/ReviewCard";
import ReviewComplete from "./review/ReviewComplete";

const SESSION_KEY = "sr-review-session";

interface SavedSessionState {
  mode: ReviewMode;
  randomIndex: number;
  timestamp: number;
}

export default function ReviewSession({ dueCards, allCards, subcategories, srSettings, onReviewSection, onLogError, onBack, preSelectedCategory }: ReviewSessionProps) {
  const [mode, setMode] = useState<ReviewMode>(null);
  const [items, setItems] = useState<DueItem[]>([]);
  const [randomIndex, setRandomIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [savedSession, setSavedSession] = useState<SavedSessionState | null>(null);
  const reviewStartRef = useRef(Date.now());

  // Check for saved session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === "object" && parsed !== null &&
          "timestamp" in parsed && typeof (parsed as Record<string, unknown>).timestamp === "number" &&
          Number.isFinite((parsed as Record<string, unknown>).timestamp) &&
          Date.now() - ((parsed as SavedSessionState).timestamp) < 2 * 60 * 60 * 1000
        ) {
          setSavedSession(parsed as SavedSessionState);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (_) {}
  }, []);

  const clearSavedSession = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
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
    const state = { mode, randomIndex, timestamp: Date.now() };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch (_) {}
  }, [mode, randomIndex, finished]);

  const handlePauseSession = useCallback(() => {
    saveSessionState();
    onBack();
  }, [saveSessionState, onBack]);

  const resumeSession = useCallback(() => {
    if (!savedSession) return;
    let resumeMode: ReviewMode = savedSession.mode;
    // Legacy migration: old mode names → new ones
    const modeStr = resumeMode as string;
    if (modeStr === "essay") resumeMode = "stabilization";
    else if (modeStr === "random") resumeMode = "critical";
    else if (modeStr === "difficult") resumeMode = "hardest";
    setMode(resumeMode);
    setRandomIndex(savedSession.randomIndex || 0);
    setSavedSession(null);
    clearSavedSession();
  }, [savedSession, clearSavedSession]);

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
        subcategories={subcategories}
        srSettings={srSettings}
        onSelectMode={handleSelectMode}
        onBack={onBack}
        savedSession={savedSession}
        onResumeSession={resumeSession}
        onClearSavedSession={() => { setSavedSession(null); clearSavedSession(); }}
        preSelectedCategory={preSelectedCategory}
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
      onBack={() => setMode(null)}
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
