import { Flame } from "lucide-react";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import ScrollableRow from "@/components/ScrollableRow";
import type { Card } from "@/lib/spaced-repetition";
interface SessionFiltersProps {
  /** Unique prefix for layoutId animations (e.g. "learn", "review") */
  layoutPrefix: string;
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  selectedCategory: string | null;
  selectedSubcategory: string | null;
  selectedChapter: string | null;
  filterExamFrequent: boolean;
  examFrequentCount: number;
  filterType?: "all" | "essay" | "flash";
  onSelectCategory: (cat: string | null) => void;
  onSelectSubcategory: (sub: string | null) => void;
  onSelectChapter: (ch: string | null) => void;
  onToggleExamFrequent: () => void;
  onFilterTypeChange?: (type: "all" | "essay" | "flash") => void;
}

export default function SessionFilters({
  layoutPrefix,
  cards,
  categories,
  subcategories,
  selectedCategory,
  selectedSubcategory,
  selectedChapter,
  filterExamFrequent,
  examFrequentCount,
  filterType = "all",
  onSelectCategory,
  onSelectSubcategory,
  onSelectChapter,
  onToggleExamFrequent,
  onFilterTypeChange,
}: SessionFiltersProps) {
  const availableSubs = selectedCategory ? (subcategories[selectedCategory] || []) : [];

  const chaptersInSub = useMemo(() => {
    if (!selectedSubcategory) return [];
    return Array.from(new Set(
      cards.filter(c => c.category === selectedCategory && c.subcategory === selectedSubcategory && c.chapter)
        .map(c => c.chapter!)
    )).sort();
  }, [cards, selectedCategory, selectedSubcategory]);

  if (categories.length < 1) return null;

  return (
    <div className="space-y-3">
      {/* Type + Exam frequent row */}
      <div className="flex items-center gap-6 flex-wrap">
        {onFilterTypeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tip</span>
            <div className="flex gap-1">
              {(["all", "essay", "flash"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => onFilterTypeChange(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterType === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  {t === "all" ? "Sve" : t === "essay" ? "Esejska" : "Blic"}
                </button>
              ))}
            </div>
          </div>
        )}
        {onFilterTypeChange && examFrequentCount > 0 && <div className="w-px h-6 bg-border hidden sm:block" />}
        {examFrequentCount > 0 && (
          <button
            onClick={onToggleExamFrequent}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${filterExamFrequent ? "bg-destructive/15 text-destructive border border-destructive/30" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
          >
            <Flame className="h-3 w-3" />
            Često na ispitu ({examFrequentCount})
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kategorija</label>
      </div>

      {/* Category pills */}
      <ScrollableRow>
        <motion.button
          onClick={() => onSelectCategory(null)}
          className={`relative px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${!selectedCategory ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          whileTap={{ scale: 0.95 }}
        >
          {!selectedCategory && (
            <motion.span layoutId={`${layoutPrefix}-cat-pill`} className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />
          )}
          <span className="relative z-10">Sve</span>
        </motion.button>
        {categories.map((c) => (
          <motion.button
            key={c}
            onClick={() => onSelectCategory(c)}
            className={`relative px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-colors ${selectedCategory === c ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            whileTap={{ scale: 0.95 }}
          >
            {selectedCategory === c && (
              <motion.span layoutId={`${layoutPrefix}-cat-pill`} className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />
            )}
            <span className="relative z-10">{c}</span>
            <span className={`relative z-10 text-[10px] px-1.5 py-0.5 rounded-full ${selectedCategory === c ? "bg-primary-foreground/20" : "bg-secondary"}`}>
              {cards.filter(card => card.category === c).length}
            </span>
          </motion.button>
        ))}
      </ScrollableRow>

      {/* Subcategory pills */}
      <AnimatePresence>
        {selectedCategory && availableSubs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
              <motion.button
                onClick={() => onSelectSubcategory(null)}
                className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${!selectedSubcategory ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                whileTap={{ scale: 0.95 }}
              >
                {!selectedSubcategory && (
                  <motion.span layoutId={`${layoutPrefix}-subcat-pill`} className="absolute inset-0 rounded-md bg-primary/15" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
                )}
                <span className="relative z-10">Sve podkat.</span>
              </motion.button>
              {availableSubs.map((sc) => (
                <motion.button
                  key={sc}
                  onClick={() => onSelectSubcategory(sc)}
                  className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${selectedSubcategory === sc ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  whileTap={{ scale: 0.95 }}
                >
                  {selectedSubcategory === sc && (
                    <motion.span layoutId={`${layoutPrefix}-subcat-pill`} className="absolute inset-0 rounded-md bg-primary/15" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
                  )}
                  <span className="relative z-10">{sc}</span>
                </motion.button>
              ))}
            </ScrollableRow>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chapter pills */}
      <AnimatePresence>
        {selectedSubcategory && chaptersInSub.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ScrollableRow className="pl-6 border-l-2 border-primary/10 ml-1">
              <motion.button
                onClick={() => onSelectChapter(null)}
                className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${!selectedChapter ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                whileTap={{ scale: 0.95 }}
              >
                {!selectedChapter && (
                  <motion.span layoutId={`${layoutPrefix}-chapter-pill`} className="absolute inset-0 rounded-md bg-primary/10" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
                )}
                <span className="relative z-10">Sve glave</span>
              </motion.button>
              {chaptersInSub.map((ch) => (
                <motion.button
                  key={ch}
                  onClick={() => onSelectChapter(ch)}
                  className={`relative px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${selectedChapter === ch ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  whileTap={{ scale: 0.95 }}
                >
                  {selectedChapter === ch && (
                    <motion.span layoutId={`${layoutPrefix}-chapter-pill`} className="absolute inset-0 rounded-md bg-primary/10" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
                  )}
                  <span className="relative z-10">{ch}</span>
                </motion.button>
              ))}
            </ScrollableRow>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
