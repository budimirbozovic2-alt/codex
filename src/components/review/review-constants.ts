import { Target, Shield, Zap, BookOpen, CalendarClock } from "lucide-react";
import { OnboardingSlide } from "@/components/OnboardingModal";
import { Card, Section, SRSettings } from "@/lib/spaced-repetition";
import type { ReviewMode } from "@/domains/review/types";

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
  categoryRecords: import("@/lib/db-types").CategoryRecord[];
  srSettings: SRSettings;
  reviewLog: import("@/lib/storage").ReviewLogEntry[];
  onReviewSection: (cardId: string, sectionId: string, grade: number) => void;
  onLogError: (cardId: string, text: string, sectionId?: string) => void;
  onBack: () => void;
  
  /**
   * When set, the review session is hard-scoped to this category UUID.
   * UI must hide / disable any control that would broaden the scope
   * (category pills, "all" reset on back-to-modes, etc.).
   * Pass through unchanged from `ReviewPage` → `ReviewSession` → `ReviewSetup`.
   */
  lockedCategory?: string | null;
  /**
   * When set, skip the ReviewSetup mode picker and start the session
   * directly in this mode. Driven by `?mode=…` in the URL.
   */
  autoMode?: Exclude<ReviewMode, null>;
}

export const REVIEW_ONBOARDING_KEY = "sr-review-onboarding-seen";

export const REVIEW_SLIDES: OnboardingSlide[] = [
  {
    icon: Target,
    iconColor: "bg-primary/15 text-primary",
    title: "Fokusirano Utvrđivanje",
    content: "Cilja svježe i pogrešne kartice (Learning/Relearning, niska stabilnost). Prebacuje ih iz kratkoročne u dugoročnu memoriju.",
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
    icon: CalendarClock,
    iconColor: "bg-success/15 text-success",
    title: "Redovno Ponavljanje",
    content: "FSRS-dospjele sekcije koje ne ulaze u ostale režime — redovni raspored bez ranog ponavljanja.",
  },
  {
    icon: BookOpen,
    iconColor: "bg-muted text-muted-foreground",
    title: "Ocjenjivanje (1\u20134)",
    content: "1 — Ponovo (ponovi uskoro)\n2 — Teško (kratak interval)\n3 — Dobro (interval raste)\n4 — Lako (maksimalan rast)\n\nPrečice: Space otkriva, 1-4 ocjenjuje, N bilježi grešku.",
  },
];

export const REVIEW_SHORTCUTS = [
  { keys: "Space", description: "Otkrij odgovor" },
  { keys: "1-4", description: "Ocijeni (samo nakon otkrivanja)" },
  { keys: "N", description: "Zabilježi grešku" },
];
