import { ArrowLeft, BookOpen } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db";
import { AnimatePresence } from "framer-motion";
import ChapterBox from "./mental-skeleton/ChapterBox";
import LearnModal from "./mental-skeleton/LearnModal";
import AuditorDetailPanel from "./mental-skeleton/AuditorDetailPanel";
import { UNASSIGNED_CHAPTER } from "./mental-skeleton/types";

interface Props {
  cards: Card[];
  subcategory: string;
  category: string;
  onBack: () => void;
}

function getChapters(cards: Card[]): string[] {
  const chapters = new Set<string>();
  cards.forEach(c => {
    const ch = c.chapterId;
    if (ch && ch !== "") chapters.add(ch);
  });
  return Array.from(chapters).sort((a, b) => {
    const match = (s: string) => { const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : null; };
    const numA = match(a), numB = match(b);
    if (numA !== null && numB !== null) return numA - numB;
    return a.localeCompare(b);
  });
}

export default function MentalSkeleton({ cards, subcategory, category, onBack }: Props) {
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

  const subCards = useMemo(() =>
    cards.filter(c => c.categoryId === category && c.subcategoryId === subcategory),
    [cards, category, subcategory]
  );

  const chapters = useMemo(() => getChapters(subCards), [subCards]);
  const unassignedCards = useMemo(() => subCards.filter(c => !c.chapterId), [subCards]);

  const cardsByChapter = useMemo(() => {
    const map: Record<string, Card[]> = {};
    chapters.forEach(ch => { map[ch] = []; });
    map[UNASSIGNED_CHAPTER] = [];
    subCards.forEach(c => {
      const ch = c.chapterId;
      const chKey = ch && ch !== "" ? ch : UNASSIGNED_CHAPTER;
      if (!map[chKey]) map[chKey] = [];
      map[chKey].push(c);
    });
    return map;
  }, [subCards, chapters]);

  const allChapters = useMemo(() => [...chapters, UNASSIGNED_CHAPTER], [chapters]);

  const toggleChapter = useCallback((ch: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  }, []);

  useEffect(() => {
    const allChapterNames = new Set([UNASSIGNED_CHAPTER, ...chapters]);
    setExpandedChapters(prev => {
      if (prev.has("__all__")) return allChapterNames;
      const next = new Set(prev);
      let changed = false;
      for (const ch of allChapterNames) {
        if (!next.has(ch) && !prev.has(ch)) { next.add(ch); changed = true; }
      }
      for (const ch of next) {
        if (!allChapterNames.has(ch)) { next.delete(ch); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [chapters]);

  useEffect(() => {
    if (!expandedChapters.has("__all__")) {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expandedChapters]));
    }
  }, [expandedChapters, EXPANDED_KEY]);

  const levelCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    subCards.forEach(c => counts[getCardMasteryLevel(c)]++);
    return counts;
  }, [subCards]);

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
      </div>

      {/* Mastery legend */}
      <div className="flex flex-wrap gap-2 p-3 rounded-xl border bg-card">
        {MASTERY_LEVELS.map((ml, i) => (
          <div key={ml.level} className="flex items-center gap-1.5 text-[11px]">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: ml.color }} />
            <span className="text-muted-foreground">{ml.label}</span>
            <span className="font-medium">{levelCounts[i]}</span>
          </div>
        ))}
      </div>

      {/* Chapters */}
      <div className="space-y-2">
        {allChapters.map(chapter => (
          <ChapterBox
            key={chapter}
            chapter={chapter}
            cards={cardsByChapter[chapter] || []}
            isOpen={expandedChapters.has(chapter)}
            onToggle={() => toggleChapter(chapter)}
            onCardClick={setSelectedCard}
          />
        ))}
      </div>

      {subCards.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Nema kartica u ovoj podkategoriji</p>
        </div>
      )}

      {/* Detail modal — read-only */}
      <AnimatePresence>
        {selectedCard && (
          <AuditorDetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
