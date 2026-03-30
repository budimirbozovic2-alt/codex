import { Target, Shield, Zap, BookOpen } from "lucide-react";
import { OnboardingSlide } from "@/components/OnboardingModal";
import { Card, Section, SRSettings } from "@/lib/spaced-repetition";

export type ReviewMode = "stabilization" | "critical" | "hardest" | null;
export type ViewWidth = "compact" | "normal" | "wide" | "full";

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

export interface DueItem {
  card: Card;
  section: Section;
}

export interface ReviewSessionProps {
  dueCards: Card[];
  allCards: Card[];
  categoryRecords: import("@/lib/db").CategoryRecord[];
  subcategories: Record<string, string[]>;
  srSettings: SRSettings;
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onLogError: (cardId: string, text: string, sectionId?: string) => void;
  onBack: () => void;
  preSelectedCategory?: string | null;
}

export const REVIEW_ONBOARDING_KEY = "sr-review-onboarding-seen";

export const REVIEW_SLIDES: OnboardingSlide[] = [
  {
    icon: Target,
    iconColor: "bg-primary/15 text-primary",
    title: "Fokusirano Utvrđivanje",
    content: "Cilja svježe i pogrešne kartice (Learning/Relearning, S<5d). Prebacuje ih iz kratkoročne u dugoročnu memoriju.",
  },
  {
    icon: Shield,
    iconColor: "bg-warning/15 text-warning",
    title: "Kritični Pregled",
    content: "Hvata kartice kad im je vjerovatnoća prisjećanja 80\u201385%. Idealan trenutak za minimalan utrošak vremena uz maksimalnu korist.",
  },
  {
    icon: Zap,
    iconColor: "bg-destructive/15 text-destructive",
    title: "Najteža Pitanja",
    content: "Top 50 najtežih: Leech kartice (\u22655 padova) + visoka težina (D>7). Fokusirana sesija za najtvrdokornije gradivo.",
  },
  {
    icon: BookOpen,
    iconColor: "bg-success/15 text-success",
    title: "Ocjenjivanje (1\u20134)",
    content: "1 \u2014 Potpuno nepoznato (\u223C20 min)\n2 \u2014 Poznato bez detalja (max 24h)\n3 \u2014 Sa ključnim detaljima (interval raste)\n4 \u2014 Savršeno (maksimalan rast)\n\nPrečice: Space otkriva, 1-4 ocjenjuje, N bilježi grešku.",
  },
];

export const REVIEW_SHORTCUTS = [
  { keys: "Space", description: "Otkrij odgovor" },
  { keys: "1-4", description: "Ocijeni (Opet → Lako)" },
  { keys: "Z", description: "Poništi zadnju ocjenu" },
  { keys: "N", description: "Zabilježi grešku" },
];
