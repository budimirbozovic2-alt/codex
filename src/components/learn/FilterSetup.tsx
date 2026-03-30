import { BookOpen, ArrowLeft, ListOrdered, TrendingDown, Eye } from "lucide-react";
import { Card } from "@/lib/spaced-repetition";
import { LearnMode } from "@/lib/storage";
import { motion } from "framer-motion";
import SessionFilters from "@/components/SessionFilters";
import { Button } from "@/components/ui/button";
import { SortMode } from "./types";
import type { CategoryRecord } from "@/lib/db";

interface Props {
  cards: Card[];
  sortedCardsCount: number;
  learnMode: LearnMode;
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
  onBackToMode: () => void;
}

const SORT_OPTIONS = [
  { key: "order" as const, label: "Hronološki", desc: "Hronološkim redoslijedom", icon: ListOrdered },
  { key: "weakest" as const, label: "Najslabija", desc: "Najniži rezultat prvo", icon: TrendingDown },
  { key: "leastRead" as const, label: "Najmanje čitana", desc: "Nepročitana prvo", icon: Eye },
];

const MODE_LABELS: Record<LearnMode, string> = {
  "free": "Slobodno učenje",
  "active-recall": "Aktivno prisjećanje",
  "chain": "Metod lanca",
};

export default function FilterSetup({
  cards, sortedCardsCount, learnMode, categories, subcategories,
  selectedCategory, selectedSubcategory, selectedChapter,
  filterExamFrequent, examFrequentCount, filterType, sortMode,
  onSelectCategory, onSelectSubcategory, onSelectChapter,
  onToggleExamFrequent, onFilterTypeChange, onSortModeChange,
  onStart, onBackToMode,
}: Props) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
      <div>
        <button onClick={onBackToMode} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
          <ArrowLeft className="h-4 w-4" /> Nazad na režime
        </button>
        <h2 className="imperial-title">{MODE_LABELS[learnMode]}</h2>
        <p className="text-muted-foreground mt-1">{sortedCardsCount} pitanja dostupno.</p>
      </div>

      <SessionFilters
        layoutPrefix="learn" cards={cards} categories={categories} subcategories={subcategories}
        selectedCategory={selectedCategory} selectedSubcategory={selectedSubcategory} selectedChapter={selectedChapter}
        filterExamFrequent={filterExamFrequent} examFrequentCount={examFrequentCount} filterType={filterType}
        onSelectCategory={onSelectCategory}
        onSelectSubcategory={onSelectSubcategory}
        onSelectChapter={onSelectChapter}
        onToggleExamFrequent={onToggleExamFrequent}
        onFilterTypeChange={onFilterTypeChange}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Redoslijed</label>
        <div className="grid gap-2">
          {SORT_OPTIONS.map(({ key, label, desc, icon: Icon }) => (
            <button key={key} onClick={() => onSortModeChange(key)}
              className={`rounded-xl border p-3 text-left transition-colors flex items-center gap-3 ${
                sortMode === key ? "border-primary bg-primary/5" : "bg-card hover:border-primary/50"
              }`}>
              <div className={`p-1.5 rounded-lg ${sortMode === key ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div><p className="font-medium text-sm">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
            </button>
          ))}
        </div>
      </div>

      <Button onClick={onStart} className="w-full py-6 text-base" disabled={sortedCardsCount === 0}>
        <BookOpen className="h-4 w-4 mr-2" /> Počni učenje
      </Button>
    </motion.div>
  );
}
