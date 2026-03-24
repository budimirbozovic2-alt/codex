import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Card, getDueSections, SRSettings, SectionState, getRetrievability, isLeech } from "@/lib/spaced-repetition";
import { addActivityEntry } from "@/lib/metacognitive-storage";
import { ReviewMode, DueItem, ViewWidth, ReviewSessionProps } from "./review/review-constants";
import ReviewSetup from "./review/ReviewSetup";
import ReviewCard from "./review/ReviewCard";
import ReviewComplete from "./review/ReviewComplete";

const SESSION_KEY = "sr-review-session";

export default function ReviewSession({ dueCards, allCards, subcategories, srSettings, onReviewSection, onLogError, onBack }: ReviewSessionProps) {
  const [mode, setMode] = useState<ReviewMode>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [filterExamFrequent, setFilterExamFrequent] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">("all");
  const [randomIndex, setRandomIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [finished, setFinished] = useState(false);
  const [viewWidth, setViewWidth] = useState<ViewWidth>("normal");
  const [savedSession, setSavedSession] = useState<any>(null);
  const reviewStartRef = useRef(Date.now());

  // Check for saved session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < 2 * 60 * 60 * 1000) {
          setSavedSession(parsed);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (_) {}
  }, []);

  const clearSavedSession = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }, []);

  // Compute items based on current filters
  const filteredDueCards = useMemo(() => {
    let filtered = dueCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.category === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter((c) => c.chapter === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("često-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter((c) => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter((c) => c.type === "flash");
    return filtered;
  }, [dueCards, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType]);

  const filteredAllCards = useMemo(() => {
    let filtered = allCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.category === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter((c) => c.chapter === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("často-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter((c) => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter((c) => c.type === "flash");
    return filtered;
  }, [allCards, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType]);

  const stabilizationItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    filteredDueCards.forEach((card) => {
      getDueSections(card).forEach((section) => {
        if ((section.state === SectionState.Learning || section.state === SectionState.Relearning) && section.stability < 5) {
          items.push({ card, section });
        }
      });
    });
    items.sort((a, b) => a.section.stability - b.section.stability);
    return items;
  }, [filteredDueCards]);

  const criticalItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    filteredAllCards.forEach((card) => {
      card.sections.forEach((section) => {
        if (section.state === SectionState.New) return;
        const r = getRetrievability(section);
        if (r >= 80 && r <= 85) items.push({ card, section });
      });
    });
    items.sort((a, b) => getRetrievability(a.section) - getRetrievability(b.section));
    return items;
  }, [filteredAllCards]);

  const hardestItems = useMemo<DueItem[]>(() => {
    const leechItems: DueItem[] = [];
    const highDiffItems: DueItem[] = [];
    filteredAllCards.forEach((card) => {
      card.sections.forEach((section) => {
        if (section.state === SectionState.New) return;
        if (isLeech(section, srSettings)) leechItems.push({ card, section });
        else if (section.difficulty > 7) highDiffItems.push({ card, section });
      });
    });
    highDiffItems.sort((a, b) => b.section.difficulty - a.section.difficulty);
    const combined = [...leechItems];
    const remaining = 50 - combined.length;
    if (remaining > 0) combined.push(...highDiffItems.slice(0, remaining));
    return combined.slice(0, 50);
  }, [filteredAllCards, srSettings]);

  const getCurrentItems = (): DueItem[] => {
    switch (mode) {
      case "stabilization": return stabilizationItems;
      case "critical": return criticalItems;
      case "hardest": return hardestItems;
      default: return [];
    }
  };

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
    const state = { mode, selectedCategory, selectedSubcategory, filterExamFrequent, randomIndex, timestamp: Date.now() };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch (_) {}
  }, [mode, selectedCategory, selectedSubcategory, filterExamFrequent, randomIndex, finished]);

  const handlePauseSession = useCallback(() => {
    saveSessionState();
    onBack();
  }, [saveSessionState, onBack]);

  const resumeSession = useCallback(() => {
    if (!savedSession) return;
    let resumeMode = savedSession.mode;
    if (resumeMode === "essay") resumeMode = "stabilization";
    if (resumeMode === "random") resumeMode = "critical";
    if (resumeMode === "difficult") resumeMode = "hardest";
    setMode(resumeMode);
    setSelectedCategory(savedSession.selectedCategory);
    setSelectedSubcategory(savedSession.selectedSubcategory);
    setFilterExamFrequent(savedSession.filterExamFrequent || false);
    setRandomIndex(savedSession.randomIndex || 0);
    setSavedSession(null);
    clearSavedSession();
  }, [savedSession, clearSavedSession]);

  const handleSelectMode = useCallback((
    selectedMode: ReviewMode,
    cat: string | null,
    sub: string | null,
    chapter: string | null,
    examFreq: boolean,
    fType: "all" | "essay" | "flash",
  ) => {
    setMode(selectedMode);
    setSelectedCategory(cat);
    setSelectedSubcategory(sub);
    setSelectedChapter(chapter);
    setFilterExamFrequent(examFreq);
    setFilterType(fType);
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
      />
    );
  }

  // ── Active review ──
  const items = getCurrentItems();
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
