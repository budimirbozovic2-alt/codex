import { Flame, Lock, type LucideIcon } from "lucide-react";
import { useMemo, type ComponentType } from "react";
import { motion } from "framer-motion";

import ScrollableRow from "@/components/ScrollableRow";
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db";

export interface SortControlOption<T extends string = string> {
  key: T;
  label: string;
  desc: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
}

export interface SortControl<T extends string = string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SortControlOption<T>>;
  label?: string;
}

interface SessionFiltersProps {
  /** Unique prefix for layoutId animations (e.g. "learn", "review") */
  layoutPrefix: string;
  cards: Card[];
  categories: string[];
  /** CategoryRecords for resolving UUID → display name */
  categoryRecords?: CategoryRecord[];
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
  /** Optional sort control rendered at the bottom of the panel */
  sortControl?: SortControl;
  /**
   * When set, the category row renders as a single read-only pill (with lock
   * icon) and `onSelectCategory` is never invoked. Sub-filters remain active.
   */
  lockedCategory?: string | null;
}

const PILL_BASE = "relative px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors";
const PILL_ACTIVE = "text-primary-foreground";
const PILL_IDLE = "text-muted-foreground hover:text-foreground";

export default function SessionFilters({
  layoutPrefix,
  cards,
  categories,
  categoryRecords,
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
  sortControl,
  lockedCategory,
}: SessionFiltersProps) {
  // Helper to resolve UUID → display name
  const catName = (id: string) => categoryRecords?.find(r => r.id === id)?.name ?? id;
  const subNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of (categoryRecords || []))
      for (const n of (r.subcategories || [])) {
        if (typeof n === 'object' && n.id) m[n.id] = n.name;
        for (const ch of (n.chapters || []))
          if (typeof ch === 'object' && ch.id) m[ch.id] = ch.name;
      }
    return m;
  }, [categoryRecords]);
  const availableSubs = selectedCategory ? (subcategories[selectedCategory] || []) : [];

  const chapterPosMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of (categoryRecords || [])) {
      for (const sub of (r.subcategories || [])) {
        if (typeof sub === 'object' && sub.chapters) {
          sub.chapters.forEach((ch: any, i: number) => {
            const id = typeof ch === 'string' ? ch : ch.id;
            const order = typeof ch === 'string' ? i : (ch.sortOrder ?? i);
            m[id] = order;
          });
        }
      }
    }
    return m;
  }, [categoryRecords]);

  const chaptersInSub = useMemo(() => {
    if (!selectedSubcategory) return [];
    return Array.from(new Set(
      cards.filter(c => c.categoryId === selectedCategory && c.subcategoryId === selectedSubcategory && c.chapterId)
        .map(c => c.chapterId!)
    )).sort((a, b) => (chapterPosMap[a] ?? 999) - (chapterPosMap[b] ?? 999));
  }, [cards, selectedCategory, selectedSubcategory, chapterPosMap]);

  // Live count: how many cards match the currently selected filters
  const filteredCount = useMemo(() => {
    return cards.filter(c => {
      if (selectedCategory && c.categoryId !== selectedCategory) return false;
      if (selectedSubcategory && c.subcategoryId !== selectedSubcategory) return false;
      if (selectedChapter && c.chapterId !== selectedChapter) return false;
      if (filterType === "essay" && c.type !== "essay") return false;
      if (filterType === "flash" && c.type !== "flash") return false;
      if (filterExamFrequent && !c.tags?.includes("exam-frequent")) return false;
      return true;
    }).length;
  }, [cards, selectedCategory, selectedSubcategory, selectedChapter, filterType, filterExamFrequent]);

  if (categories.length < 1) return null;

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">Filteri</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="text-foreground font-medium">{filteredCount}</span>
          <span className="text-muted-foreground/60"> / {cards.length}</span>
          <span className="ml-1">modula</span>
        </span>
      </div>

      {/* Type + Exam frequent row */}
      {(onFilterTypeChange || examFrequentCount > 0) && (
        <div className="flex items-center gap-3 flex-wrap">
          {onFilterTypeChange && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tip</span>
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
          {examFrequentCount > 0 && (
            <button
              onClick={onToggleExamFrequent}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ml-auto ${filterExamFrequent ? "bg-destructive/15 text-destructive border border-destructive/30" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
            >
              <Flame className="h-3 w-3" />
              Često na ispitu ({examFrequentCount})
            </button>
          )}
        </div>
      )}

      <div className="h-px bg-border/60" />

      {/* Predmet (Category) */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Predmet</label>
        <ScrollableRow>
          <motion.button
            onClick={() => onSelectCategory(null)}
            className={`${PILL_BASE} ${!selectedCategory ? PILL_ACTIVE : PILL_IDLE}`}
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
              className={`${PILL_BASE} flex items-center gap-1.5 ${selectedCategory === c ? PILL_ACTIVE : PILL_IDLE}`}
              whileTap={{ scale: 0.95 }}
            >
              {selectedCategory === c && (
                <motion.span layoutId={`${layoutPrefix}-cat-pill`} className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />
              )}
              <span className="relative z-10">{catName(c)}</span>
              <span className={`relative z-10 text-[10px] px-1.5 py-0.5 rounded-full ${selectedCategory === c ? "bg-primary-foreground/20" : "bg-secondary"}`}>
                {cards.filter(card => card.categoryId === c).length}
              </span>
            </motion.button>
          ))}
        </ScrollableRow>
      </div>

      {/* Potkategorija — uvijek vidljivo */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Potkategorija</label>
        {!selectedCategory ? (
          <div className="flex">
            <span className={`${PILL_BASE} bg-secondary/40 text-muted-foreground/60 cursor-default`}>
              Najprije izaberi predmet
            </span>
          </div>
        ) : availableSubs.length === 0 ? (
          <div className="flex">
            <span className={`${PILL_BASE} bg-secondary/40 text-muted-foreground/60 cursor-default`}>
              Nema potkategorija u ovom predmetu
            </span>
          </div>
        ) : (
          <ScrollableRow>
            <motion.button
              onClick={() => onSelectSubcategory(null)}
              className={`${PILL_BASE} ${!selectedSubcategory ? PILL_ACTIVE : PILL_IDLE}`}
              whileTap={{ scale: 0.95 }}
            >
              {!selectedSubcategory && (
                <motion.span layoutId={`${layoutPrefix}-subcat-pill`} className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
              )}
              <span className="relative z-10">Sve</span>
            </motion.button>
            {availableSubs.map((sc) => (
              <motion.button
                key={sc}
                onClick={() => onSelectSubcategory(sc)}
                className={`${PILL_BASE} ${selectedSubcategory === sc ? PILL_ACTIVE : PILL_IDLE}`}
                whileTap={{ scale: 0.95 }}
              >
                {selectedSubcategory === sc && (
                  <motion.span layoutId={`${layoutPrefix}-subcat-pill`} className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
                )}
                <span className="relative z-10">{subNameMap[sc] || sc}</span>
              </motion.button>
            ))}
          </ScrollableRow>
        )}
      </div>

      {/* Glava (Chapter) — uvijek vidljivo */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Glava</label>
        {!selectedSubcategory ? (
          <div className="flex">
            <span className={`${PILL_BASE} bg-secondary/40 text-muted-foreground/60 cursor-default`}>
              {selectedCategory ? "Najprije izaberi potkategoriju" : "Najprije izaberi predmet"}
            </span>
          </div>
        ) : chaptersInSub.length === 0 ? (
          <div className="flex">
            <span className={`${PILL_BASE} bg-secondary/40 text-muted-foreground/60 cursor-default`}>
              Nema glava u ovoj potkategoriji
            </span>
          </div>
        ) : (
          <ScrollableRow>
            <motion.button
              onClick={() => onSelectChapter(null)}
              className={`${PILL_BASE} ${!selectedChapter ? PILL_ACTIVE : PILL_IDLE}`}
              whileTap={{ scale: 0.95 }}
            >
              {!selectedChapter && (
                <motion.span layoutId={`${layoutPrefix}-chapter-pill`} className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
              )}
              <span className="relative z-10">Sve</span>
            </motion.button>
            {chaptersInSub.map((ch) => (
              <motion.button
                key={ch}
                onClick={() => onSelectChapter(ch)}
                className={`${PILL_BASE} ${selectedChapter === ch ? PILL_ACTIVE : PILL_IDLE}`}
                whileTap={{ scale: 0.95 }}
              >
                {selectedChapter === ch && (
                  <motion.span layoutId={`${layoutPrefix}-chapter-pill`} className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
                )}
                <span className="relative z-10">{subNameMap[ch] || ch}</span>
              </motion.button>
            ))}
          </ScrollableRow>
        )}
      </div>

      {/* Redoslijed (opciono) */}
      {sortControl && (
        <>
          <div className="h-px bg-border/60" />
          <div className="space-y-2">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {sortControl.label ?? "Redoslijed"}
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {sortControl.options.map(({ key, label, desc, icon: Icon }) => {
                const active = sortControl.value === key;
                return (
                  <button
                    key={key}
                    onClick={() => sortControl.onChange(key)}
                    className={`rounded-xl border p-3 text-left transition-colors flex items-center gap-3 ${
                      active ? "border-primary bg-primary/5" : "bg-card hover:border-primary/50"
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 ${active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{label}</p>
                      <p className="text-xs text-muted-foreground truncate">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
