import { ArrowLeft, Eye, Compass, Plus, X, BookOpen } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Card, SectionState, calculateNextReview } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, getMasteryColor, MASTERY_LEVELS } from "@/components/KnowledgeMap";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DndContext, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent,
  MeasuringStrategy,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import ChapterBox from "./mental-skeleton/ChapterBox";
import DraggableCardTile from "./mental-skeleton/DraggableCardTile";
import LearnModal from "./mental-skeleton/LearnModal";
import AuditorDetailPanel from "./mental-skeleton/AuditorDetailPanel";
import { Mode, UNASSIGNED_CHAPTER } from "./mental-skeleton/types";
import { useChapterManagement } from "@/hooks/useChapterManagement";

interface Props {
  cards: Card[];
  subcategory: string;
  category: string;
  onBack: () => void;
  onUpdateChapters: (updates: { id: string; chapterId: string | undefined; chapterOrder: number }[]) => void;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
}

function getChapters(cards: Card[]): string[] {
  const chapters = new Set<string>();
  cards.forEach(c => {
    const ch = c.chapterId || c.chapter;
    if (ch && ch !== "") chapters.add(ch);
  });
  return Array.from(chapters).sort((a, b) => {
    const numA = extractChapterNum(a);
    const numB = extractChapterNum(b);
    if (numA !== null && numB !== null) return numA - numB;
    return a.localeCompare(b);
  });
}

function extractChapterNum(name: string): number | null {
  const match = name.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}


// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function MentalSkeleton({ cards, subcategory, category, onBack, onUpdateChapters, onReviewSection }: Props) {
  const [mode, setMode] = useState<Mode>("navigator");
  const EXPANDED_KEY = useMemo(() => `codex-nav-expanded-${category}-${subcategory}`, [category, subcategory]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(EXPANDED_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr) && arr.length > 0) return new Set<string>(arr);
      }
    } catch {}
    return new Set(["__all__"]);
  });
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Filter cards for this subcategory
  const subCards = useMemo(() =>
    cards.filter(c => c.categoryId === category && (c.subcategoryId || c.subcategory) === subcategory),
    [cards, category, subcategory]
  );

  const chapters = useMemo(() => getChapters(subCards), [subCards]);
  const unassignedCards = useMemo(() =>
    subCards.filter(c => !(c.chapterId || c.chapter)),
    [subCards]
  );

  const cardsByChapter = useMemo(() => {
    const map: Record<string, Card[]> = {};
    chapters.forEach(ch => { map[ch] = []; });
    map[UNASSIGNED_CHAPTER] = [];
    subCards.forEach(c => {
      const ch = (c.chapterId || c.chapter);
      const chKey = ch && ch !== "" ? ch : UNASSIGNED_CHAPTER;
      if (!map[chKey]) map[chKey] = [];
      map[chKey].push(c);
    });
    return map;
  }, [subCards, chapters]);

  const {
    allChapters,
    addingChapter, setAddingChapter,
    newChapterName, setNewChapterName,
    renamingChapter, setRenamingChapter,
    renameValue, setRenameValue,
    handleAddChapter,
    handleRenameChapter,
    submitRename,
    handleDeleteChapter,
    handleMoveChapter,
  } = useChapterManagement({
    categoryId: category,
    subcategoryId: subcategory,
    cardsByChapter,
    cardDerivedChapters: chapters,
    onUpdateChapters,
  });

   // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const toggleChapter = useCallback((ch: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  }, []);

  // Sync new/removed chapters into expandedChapters without resetting user collapses
  useEffect(() => {
    const allChapterNames = new Set([UNASSIGNED_CHAPTER, ...chapters]);
    setExpandedChapters(prev => {
      // If first visit (sentinel __all__), expand everything
      if (prev.has("__all__")) return allChapterNames;
      // Otherwise only add genuinely new chapters
      const next = new Set(prev);
      let changed = false;
      for (const ch of allChapterNames) {
        if (!next.has(ch) && !prev.has(ch)) { next.add(ch); changed = true; }
      }
      // Remove stale chapters
      for (const ch of next) {
        if (!allChapterNames.has(ch)) { next.delete(ch); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [chapters, EXPANDED_KEY]);

  // Sync expanded state to localStorage
  useEffect(() => {
    if (!expandedChapters.has("__all__")) {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expandedChapters]));
    }
  }, [expandedChapters, EXPANDED_KEY]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const findChapterForCard = useCallback((cardId: string): string => {
    for (const [ch, chCards] of Object.entries(cardsByChapter)) {
      if (chCards.some(c => c.id === cardId)) return ch;
    }
    return UNASSIGNED_CHAPTER;
  }, [cardsByChapter]);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const overId = over.id as string;
    const activeCardId = active.id as string;

    // Case 1: Dropped on a chapter header → cross-chapter move
    if (overId.startsWith("chapter-drop-")) {
      const targetChapter = overId.replace("chapter-drop-", "");
      const sourceChapter = findChapterForCard(activeCardId);
      if (sourceChapter === targetChapter) return;

      const movedCard = subCards.find(c => c.id === activeCardId);
      if (!movedCard) return;

      const targetChapterName = targetChapter === UNASSIGNED_CHAPTER ? "" : targetChapter;
      const updates: { id: string; chapter: string; chapterOrder: number }[] = [];

      const targetCards = [...(cardsByChapter[targetChapter] || [])]
        .filter(c => c.id !== activeCardId)
        .sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));
      targetCards.push(movedCard);
      targetCards.forEach((c, i) => {
        updates.push({ id: c.id, chapter: targetChapterName, chapterOrder: i });
      });

      const sourceCards = [...(cardsByChapter[sourceChapter] || [])]
        .filter(c => c.id !== activeCardId)
        .sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));
      sourceCards.forEach((c, i) => {
        updates.push({
          id: c.id,
          chapterId: sourceChapter === UNASSIGNED_CHAPTER ? "" : sourceChapter,
          chapterOrder: i,
        });
      });

      onUpdateChapters(updates);
      toast.success(`Premješteno u "${targetChapter === UNASSIGNED_CHAPTER ? "Nekategorisane" : targetChapter}"`);
      return;
    }

    // Case 2: Dropped on another card → within-chapter reorder
    const sourceChapter = findChapterForCard(activeCardId);
    const overChapter = findChapterForCard(overId);

    // Only reorder if both cards are in the same chapter
    if (sourceChapter !== overChapter || activeCardId === overId) return;

    const chapterCards = [...(cardsByChapter[sourceChapter] || [])]
      .sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));

    const oldIndex = chapterCards.findIndex(c => c.id === activeCardId);
    const newIndex = chapterCards.findIndex(c => c.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(chapterCards, oldIndex, newIndex);
    const chapterName = sourceChapter === UNASSIGNED_CHAPTER ? "" : sourceChapter;
    const updates = reordered.map((c, i) => ({ id: c.id, chapter: chapterName, chapterOrder: i }));
    onUpdateChapters(updates);
  };

  const handleCardClick = (card: Card) => {
    setSelectedCard(card);
  };

  const handleGradeSection = (sectionId: string, grade: number) => {
    if (!selectedCard) return;
    onReviewSection(selectedCard.id, sectionId, grade);
  };


  // Legend counts
  const levelCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    subCards.forEach(c => counts[getCardMasteryLevel(c)]++);
    return counts;
  }, [subCards]);

  const activeCard = activeId ? subCards.find(c => c.id === activeId) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold truncate">Mentalni Kostur</h2>
          <p className="text-xs text-muted-foreground">{category} → {subcategory} • {subCards.length} kartica</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border bg-card p-1 gap-1">
          <button
            onClick={() => setMode("navigator")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === "navigator" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"}`}
          >
            <Compass className="h-3.5 w-3.5" />
            Navigator
          </button>
          <button
            onClick={() => setMode("auditor")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === "auditor" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"}`}
          >
            <Eye className="h-3.5 w-3.5" />
            Auditor
          </button>
        </div>
      </div>

      {/* Auditor legend */}
      {mode === "auditor" && (
        <div className="flex flex-wrap gap-2 p-3 rounded-xl border bg-card">
          {MASTERY_LEVELS.map((ml, i) => (
            <div key={ml.level} className="flex items-center gap-1.5 text-[11px]">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: ml.color }} />
              <span className="text-muted-foreground">{ml.label}</span>
              <span className="font-medium">{levelCounts[i]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add chapter button (Navigator only) */}
      {mode === "navigator" && (
        <div className="flex items-center gap-2">
          {addingChapter ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                value={newChapterName}
                onChange={e => setNewChapterName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddChapter(); if (e.key === "Escape") setAddingChapter(false); }}
                placeholder="Naziv glave (npr. Glava 1)"
                className="flex-1 px-3 py-1.5 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <button onClick={handleAddChapter} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
                Dodaj
              </button>
              <button onClick={() => setAddingChapter(false)} className="p-1.5 rounded-lg hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingChapter(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Dodaj Glavu
            </button>
          )}
        </div>
      )}

      {/* Rename dialog */}
      <AnimatePresence>
        {renamingChapter && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="flex items-center gap-2 p-3 rounded-xl border bg-card">
              <span className="text-xs text-muted-foreground">Preimenuj:</span>
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenamingChapter(null); }}
                className="flex-1 px-2 py-1 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <button onClick={submitRename} className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Sačuvaj</button>
              <button onClick={() => setRenamingChapter(null)} className="p-1 rounded hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chapters with DnD — drag cards onto chapter headers */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        <div className="space-y-2">
          {allChapters.map((chapter, idx) => (
            <ChapterBox
              key={chapter}
              chapter={chapter}
              cards={cardsByChapter[chapter] || []}
              mode={mode}
              isOpen={expandedChapters.has(chapter)}
              onToggle={() => toggleChapter(chapter)}
              onCardClick={handleCardClick}
              onRename={handleRenameChapter}
              onDelete={handleDeleteChapter}
              onMoveUp={idx > 0 ? () => handleMoveChapter(idx, -1) : undefined}
              onMoveDown={idx < allChapters.length - 1 ? () => handleMoveChapter(idx, 1) : undefined}
            />
          ))}

          {/* Nekategorisane — always visible */}
          <ChapterBox
            chapter={UNASSIGNED_CHAPTER}
            cards={unassignedCards}
            mode={mode}
            isOpen={expandedChapters.has(UNASSIGNED_CHAPTER)}
            onToggle={() => toggleChapter(UNASSIGNED_CHAPTER)}
            onCardClick={handleCardClick}
            onRename={() => {}}
            onDelete={() => {}}
          />
        </div>

        {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeCard && (
              <div className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-xl pointer-events-none">
                {activeCard.question.length > 25 ? activeCard.question.slice(0, 23) + "…" : activeCard.question}
              </div>
            )}
          </DragOverlay>,
          document.body
        )}
      </DndContext>

      {subCards.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Nema kartica u ovoj podkategoriji</p>
        </div>
      )}

      {/* Modal overlays */}
      <AnimatePresence>
        {selectedCard && mode === "navigator" && (
          <LearnModal card={selectedCard} onGradeSection={handleGradeSection} onClose={() => setSelectedCard(null)} />
        )}
        {selectedCard && mode === "auditor" && (
          <AuditorDetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
