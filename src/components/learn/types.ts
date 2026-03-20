import { Card } from "@/lib/spaced-repetition";
import { LearnMode, LearnCardProgress } from "@/lib/storage";

export type SortMode = "order" | "weakest" | "leastRead";
export type ViewWidth = "compact" | "normal" | "wide" | "full";
export type SetupStep = "mode" | "filter" | "ready";

export const viewWidthClasses: Record<ViewWidth, string> = {
  compact: "max-w-xl",
  normal: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-full",
};

export const viewWidthLabels: Record<ViewWidth, string> = {
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

export interface LearnSessionProps {
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  onMarkRead: (id: string) => void;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onBack: () => void;
  onEdit?: (card: Card) => void;
  dueCount?: number;
}
