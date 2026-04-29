import { BookOpen, ArrowLeft, ListOrdered, TrendingDown, Eye } from "lucide-react";
import { Card } from "@/lib/spaced-repetition";
import { motion } from "framer-motion";
import SessionFilters from "@/components/SessionFilters";
import { Button } from "@/components/ui/button";
import { SortMode } from "./types";
import type { CategoryRecord } from "@/lib/db";

interface Props {
  cards: Card[];
  sortedCardsCount: number;
  categories: string[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
  selectedCategory: string | null;
  selectedSubcategory: string | null;
  selectedChapter: string | null;
  filterExamFrequent: boolean;
  examFrequentCount: number;
  filterType: "all" | "essay" | "flash";
  sortMode: SortMode;
  onSelectCategory: (cat: string | null) => void;
  onSelectSubcategory: (sub: string | null) => void;
  onSelectChapter: (ch: string | null) => void;
  onToggleExamFrequent: () => void;
  onFilterTypeChange: (t: "all" | "essay" | "flash") => void;
  onSortModeChange: (s: SortMode) => void;
  onStart: () => void;
  onBack: () => void;
}

const SORT_OPTIONS = [
  { key: "order" as const, label: "Hronološki", desc: "Hronološkim redoslijedom", icon: ListOrdered },
  { key: "weakest" as const, label: "Najslabija", desc: "Najniži rezultat prvo", icon: TrendingDown },
  { key: "leastRead" as const, label: "Najmanje čitana", desc: "Nepročitana prvo", icon: Eye },
];

export default function FilterSetup({
  cards, sortedCardsCount, categories, categoryRecords, subcategories,
  selectedCategory, selectedSubcategory, selectedChapter,
  filterExamFrequent, examFrequentCount, filterType, sortMode,
  onSelectCategory, onSelectSubcategory, onSelectChapter,
  onToggleExamFrequent, onFilterTypeChange, onSortModeChange,
  onStart, onBack,
}: Props) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-8 py-10">
      <div>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <h2 className="imperial-title">Aktivno prisjećanje</h2>
        <p className="text-muted-foreground mt-1">{sortedCardsCount} pitanja dostupno.</p>
      </div>

      <SessionFilters
        layoutPrefix="learn" cards={cards} categories={categories} categoryRecords={categoryRecords} subcategories={subcategories}
        selectedCategory={selectedCategory} selectedSubcategory={selectedSubcategory} selectedChapter={selectedChapter}
        filterExamFrequent={filterExamFrequent} examFrequentCount={examFrequentCount} filterType={filterType}
        onSelectCategory={onSelectCategory}
        onSelectSubcategory={onSelectSubcategory}
        onSelectChapter={onSelectChapter}
        onToggleExamFrequent={onToggleExamFrequent}
        onFilterTypeChange={onFilterTypeChange}
        sortControl={{
          value: sortMode,
          onChange: (next) => onSortModeChange(next as SortMode),
          options: SORT_OPTIONS,
          label: "Redoslijed",
        }}
      />

      <Button onClick={onStart} className="w-full py-6 text-base" disabled={sortedCardsCount === 0}>
        <BookOpen className="h-4 w-4 mr-2" /> Počni učenje
      </Button>
    </motion.div>
  );
}