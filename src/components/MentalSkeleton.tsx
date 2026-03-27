import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, SectionState, calculateNextReview } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, getMasteryColor, MASTERY_LEVELS } from "@/components/KnowledgeMap";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DndContext, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { ArrowLeft, Eye, Compass, Plus, X, BookOpen, AlertTriangle, CheckCircle } from "lucide-react";
import ChapterBox from "./mental-skeleton/ChapterBox";
import DraggableCardTile from "./mental-skeleton/DraggableCardTile";
import { Mode, UNASSIGNED_CHAPTER } from "./mental-skeleton/types";

interface Props {
  cards: Card[];
  subcategory: string;
  category: string;
  onBack: () => void;
  onUpdateChapters: (updates: { id: string; chapter: string; chapterOrder: number }[]) => void;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
}




// ── Learn Modal (overlay) ────────────────────────────────
function LearnModal({ card, onGrade, onClose }: { card: Card; onGrade: (grade: number) => void; onClose: () => void }) {
  const [revealedSections, setRevealedSections] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => {
    setRevealedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const level = getCardMasteryLevel(card);
  const grades = [
    { value: 1, label: "Pogrešno", color: "bg-red-500 hover:bg-red-600" },
    { value: 2, label: "Teško", color: "bg-orange-500 hover:bg-orange-600" },
    { value: 3, label: "Dobro", color: "bg-emerald-500 hover:bg-emerald-600" },
    { value: 4, label: "Lako", color: "bg-blue-500 hover:bg-blue-600" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-background border rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: getMasteryColor(level) }} />
              <span className="text-xs text-muted-foreground">{card.category} → {card.subcategory}</span>
              {card.chapter && <span className="text-xs text-muted-foreground">→ {card.chapter}</span>}
            </div>
            <h3 className="font-serif text-lg leading-tight">{card.question}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sections */}
        <div className="p-5 space-y-3">
          {card.sections.map(section => (
            <div key={section.id} className="border rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-secondary/30 transition-colors"
              >
                <span>{section.title}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${revealedSections.has(section.id) ? "" : "-rotate-90"}`} />
              </button>
              <AnimatePresence>
                {revealedSections.has(section.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="p-3 pt-0 text-sm prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: section.content }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Grade buttons */}
        <div className="p-5 border-t">
          <p className="text-xs text-muted-foreground text-center mb-3">Ocijeni svoje znanje</p>
          <div className="grid grid-cols-4 gap-2">
            {grades.map(g => (
              <button
                key={g.value}
                onClick={() => onGrade(g.value)}
                className={`py-2.5 rounded-xl text-white text-sm font-medium transition-all hover:scale-[1.02] ${g.color}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Auditor Detail Panel ─────────────────────────────────
function AuditorDetailPanel({ card, onClose }: { card: Card; onClose: () => void }) {
  const level = getCardMasteryLevel(card);
  const ml = MASTERY_LEVELS[level];
  const avgStability = card.sections.reduce((s, sec) => s + sec.stability, 0) / card.sections.length;
  const avgDifficulty = card.sections.reduce((s, sec) => s + sec.difficulty, 0) / card.sections.length;
  const errorLog = card.errorLog || [];
  const totalErrors = errorLog.reduce((s, e) => s + e.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-background border rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
      >
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: ml.color }} />
              <span className="text-xs font-medium" style={{ color: ml.color }}>{ml.label}</span>
            </div>
            <h3 className="font-serif text-lg leading-tight">{card.question}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 border-b grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-serif">{avgStability.toFixed(1)}d</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stabilnost</p>
          </div>
          <div>
            <p className="text-lg font-serif">{avgDifficulty.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Težina</p>
          </div>
          <div>
            <p className="text-lg font-serif">{totalErrors}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Greške</p>
          </div>
        </div>

        {/* Section mastery */}
        <div className="px-5 py-3 border-b">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Sekcije</p>
          <div className="flex flex-wrap gap-1.5">
            {card.sections.map(s => {
              const sLevel = s.state === SectionState.New ? 0 : s.stability < 3 ? 1 : s.stability < 7 ? 2 : s.stability < 15 ? 3 : s.stability <= 30 ? 4 : 5;
              return (
                <Tooltip key={s.id}>
                  <TooltipTrigger asChild>
                    <div className="px-2 py-1 rounded text-[10px] font-medium text-white" style={{ backgroundColor: getMasteryColor(sLevel) }}>
                      {s.title.length > 20 ? s.title.slice(0, 20) + "…" : s.title}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{s.title} — {s.stability.toFixed(1)}d</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Errors */}
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h4 className="font-medium text-sm">Istorija poteškoća</h4>
          </div>
          {errorLog.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <CheckCircle className="h-4 w-4 text-success" />
              Nema zabilježenih grešaka
            </div>
          ) : (
            <div className="space-y-2">
              {[...errorLog].sort((a, b) => new Date(b.lastMissed).getTime() - new Date(a.lastMissed).getTime()).slice(0, 5).map((err, i) => (
                <div key={i} className="p-2 rounded-lg border text-xs">
                  <span className="font-medium text-destructive">{err.text}</span>
                  <div className="flex gap-3 mt-1 text-muted-foreground">
                    <span>×{err.count}</span>
                    <span>Streak: {err.successStreak || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function MentalSkeleton({ cards, subcategory, category, onBack, onUpdateChapters, onReviewSection }: Props) {
  const [mode, setMode] = useState<Mode>("navigator");
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set(["__all__"]));
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState("");
  const [renamingChapter, setRenamingChapter] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [storedChapters, setStoredChapters] = useState<string[]>([]);

  // Filter cards for this subcategory
  const subCards = useMemo(() =>
    cards.filter(c => c.category === category && c.subcategory === subcategory),
    [cards, category, subcategory]
  );

  const chapters = useMemo(() => getChapters(subCards), [subCards]);
  const unassignedCards = useMemo(() =>
    subCards.filter(c => !c.chapter || c.chapter === ""),
    [subCards]
  );

  const cardsByChapter = useMemo(() => {
    const map: Record<string, Card[]> = {};
    chapters.forEach(ch => { map[ch] = []; });
    map[UNASSIGNED_CHAPTER] = [];
    subCards.forEach(c => {
      const ch = c.chapter && c.chapter !== "" ? c.chapter : UNASSIGNED_CHAPTER;
      if (!map[ch]) map[ch] = [];
      map[ch].push(c);
    });
    return map;
  }, [subCards, chapters]);

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

  // Initialize all chapters as expanded
  useEffect(() => {
    const all = new Set([UNASSIGNED_CHAPTER, ...chapters]);
    setExpandedChapters(all);
  }, [chapters.length]);

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
    // Only accept drops on chapter headers
    if (!overId.startsWith("chapter-drop-")) return;

    const targetChapter = overId.replace("chapter-drop-", "");
    const sourceChapter = findChapterForCard(active.id as string);

    // Don't do anything if dropped on same chapter
    if (sourceChapter === targetChapter) return;

    const movedCard = subCards.find(c => c.id === active.id);
    if (!movedCard) return;

    const targetChapterName = targetChapter === UNASSIGNED_CHAPTER ? "" : targetChapter;
    const updates: { id: string; chapter: string; chapterOrder: number }[] = [];

    // Add card to end of target chapter
    const targetCards = [...(cardsByChapter[targetChapter] || [])]
      .filter(c => c.id !== active.id)
      .sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));
    targetCards.push(movedCard);
    targetCards.forEach((c, i) => {
      updates.push({ id: c.id, chapter: targetChapterName, chapterOrder: i });
    });

    // Re-index source chapter
    const sourceCards = [...(cardsByChapter[sourceChapter] || [])]
      .filter(c => c.id !== active.id)
      .sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));
    sourceCards.forEach((c, i) => {
      updates.push({
        id: c.id,
        chapter: sourceChapter === UNASSIGNED_CHAPTER ? "" : sourceChapter,
        chapterOrder: i,
      });
    });

    onUpdateChapters(updates);
    toast.success(`Premješteno u "${targetChapter === UNASSIGNED_CHAPTER ? "Nekategorisane" : targetChapter}"`);
  };

  const handleCardClick = (card: Card) => {
    setSelectedCard(card);
  };

  const handleGrade = (grade: number) => {
    if (!selectedCard) return;
    // Fix #4: Grade each section — in Navigator modal this applies uniform grade
    // but the per-section FSRS tracking remains accurate via individual calls
    selectedCard.sections.forEach(s => {
      onReviewSection(selectedCard.id, s.id, grade);
    });
    toast.success(`Ocijenjeno: ${grade}`);
    setSelectedCard(null);
  };

  const handleAddChapter = () => {
    const name = newChapterName.trim();
    if (!name) return;
    toast.success(`Glava "${name}" kreirana. Prevuci kartice u nju.`);
    setNewChapterName("");
    setAddingChapter(false);

    // Update local state immediately
    setStoredChapters(prev => prev.includes(name) ? prev : [...prev, name]);

    // Fix #7: Store chapters in IndexedDB settings instead of localStorage
    const key = `chapters-${category}-${subcategory}`;
    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(key, []).then(existing => {
        if (!existing.includes(name)) {
          idbSaveSettings(key, [...existing, name]);
        }
      });
    });
  };

  const handleRenameChapter = (oldName: string) => {
    setRenamingChapter(oldName);
    setRenameValue(oldName);
  };

  const submitRename = () => {
    if (!renamingChapter || !renameValue.trim()) return;
    const chapterCards = cardsByChapter[renamingChapter] || [];
    const updates = chapterCards.map((c, i) => ({
      id: c.id,
      chapter: renameValue.trim(),
      chapterOrder: c.chapterOrder ?? i,
    }));
    onUpdateChapters(updates);

    // Fix #7: Update IDB instead of localStorage
    const key = `chapters-${category}-${subcategory}`;
    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(key, []).then(existing => {
        const updated = existing.map(ch => ch === renamingChapter ? renameValue.trim() : ch);
        idbSaveSettings(key, updated);
      });
    });

    toast.success(`Preimenovano u "${renameValue.trim()}"`);
    setRenamingChapter(null);
  };

  const handleDeleteChapter = (name: string) => {
    const chapterCards = cardsByChapter[name] || [];
    const updates = chapterCards.map((c, i) => ({ id: c.id, chapter: "", chapterOrder: 0 }));
    onUpdateChapters(updates);

    // Fix #7: Update IDB instead of localStorage
    const key = `chapters-${category}-${subcategory}`;
    import("@/lib/db").then(({ idbLoadSettings, idbSaveSettings }) => {
      idbLoadSettings<string[]>(key, []).then(existing => {
        idbSaveSettings(key, existing.filter(ch => ch !== name));
      });
    });

    toast.success(`Glava "${name}" obrisana, kartice vraćene u neraspoređene`);
  };

  // Fix #7: Load stored chapters from IDB instead of localStorage
  useEffect(() => {
    const key = `chapters-${category}-${subcategory}`;
    import("@/lib/db").then(({ idbLoadSettings }) => {
      idbLoadSettings<string[]>(key, []).then(setStoredChapters);
    });
    // Also migrate from old localStorage key if exists
    const oldKey = `memoria-chapters-${category}-${subcategory}`;
    const old = localStorage.getItem(oldKey);
    if (old) {
      try {
        const parsed = JSON.parse(old) as string[];
        if (parsed.length > 0) {
          const key2 = `chapters-${category}-${subcategory}`;
          import("@/lib/db").then(({ idbSaveSettings }) => {
            idbSaveSettings(key2, parsed);
          });
          setStoredChapters(parsed);
          localStorage.removeItem(oldKey);
        }
      } catch {}
    }
  }, [category, subcategory]);

  // Preserve stored order, append any card-derived chapters not yet stored
  const allChapters = useMemo(() => {
    const ordered = [...storedChapters];
    chapters.forEach(ch => {
      if (!ordered.includes(ch)) ordered.push(ch);
    });
    return ordered;
  }, [chapters, storedChapters]);

  const handleMoveChapter = useCallback((index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= allChapters.length) return;
    const reordered = [...allChapters];
    const [item] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, item);
    setStoredChapters(reordered);
    const key = `chapters-${category}-${subcategory}`;
    import("@/lib/db").then(({ idbSaveSettings }) => {
      idbSaveSettings(key, reordered);
    });
  }, [allChapters, category, subcategory]);

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
          <h2 className="text-xl font-serif truncate">Mentalni Kostur</h2>
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

        <DragOverlay>
          {activeCard && (
            <div className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-xl">
              {activeCard.question.length > 25 ? activeCard.question.slice(0, 23) + "…" : activeCard.question}
            </div>
          )}
        </DragOverlay>
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
          <LearnModal card={selectedCard} onGrade={handleGrade} onClose={() => setSelectedCard(null)} />
        )}
        {selectedCard && mode === "auditor" && (
          <AuditorDetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
