import { Card } from "@/lib/spaced-repetition";
import type { FrequencyTag } from "@/lib/sr/types";
import { LearnCardProgress, ReviewLogEntry } from "@/lib/storage";
import type { CategoryRecord } from "@/lib/db";

export type { LearnCardProgress };

export type SortMode = "order" | "weakest" | "leastRead";
export type VW = "compact" | "normal" | "wide" | "full";
export type ViewWidth = VW;
export type SetupStep = "filter" | "ready";

export const viewWidthClasses: Record<VW, string> = {
  compact: "max-w-xl",
  normal: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-full",
};

export const viewWidthLabels: Record<VW, string> = {
  compact: "S",
  normal: "M",
  wide: "L",
  full: "XL",
};

export const GRADE_LABELS = ["", "Ponovo", "Teško", "Dobro", "Lako"];
export const GRADE_DESCRIPTIONS = [
  "",
  "Potpuno nepoznat",
  "Propuštene ključne info",
  "Poznat + ključne info",
  "1/1 bez oklijevanja",
];
export const GRADE_COLORS = [
  "",
  "bg-destructive text-destructive-foreground",
  "bg-warning text-warning-foreground",
  "bg-primary text-primary-foreground",
  "bg-success text-success-foreground",
];

export interface InitialFilters {
  mode: "strict-recall";
  categoryId: string | null;
  subcategoryId: string | null;
  type: "all" | "essay" | "flash";
  frequencyTag: "all" | FrequencyTag;
  sortMode: "order" | "weakest";
}

export interface LearnSessionProps {
  cards: Card[];
  categories: string[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
  onMarkRead: (id: string) => void;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onBack: () => void;
  onEdit?: (card: Card) => void;
  onAddKeyPart?: (cardId: string, text: string) => void;
  dueCount?: number;
  reviewLog?: ReviewLogEntry[];
  initialFilters?: InitialFilters;
}
