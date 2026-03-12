// Enhanced SM-2 Algorithm with per-section tracking, leech detection, configurable params

export interface Section {
  id: string;
  title: string;
  content: string;
  easeFactor: number;
  interval: number; // in days (can be fractional for sub-day)
  repetitions: number;
  nextReview: number;
  lastReviewed: number | null;
  lapses: number; // count of times graded < 3
}

export interface Card {
  id: string;
  question: string;
  sections: Section[];
  category: string;
  createdAt: number;
  readCount: number;
}

export interface ReviewGrade {
  label: string;
  value: number;
  description: string;
  color: string;
}

export const GRADES: ReviewGrade[] = [
  { label: "Ništa", value: 0, description: "Potpuno zaboravljeno", color: "destructive" },
  { label: "Loše", value: 1, description: "Samo prepoznato", color: "destructive" },
  { label: "Slabo", value: 2, description: "Djelimično sjećanje", color: "warning" },
  { label: "Teško", value: 3, description: "Značajan napor", color: "warning" },
  { label: "Dobro", value: 4, description: "Mali napor", color: "primary" },
  { label: "Lako", value: 5, description: "Savršeno", color: "success" },
];

export interface SRSettings {
  initialInterval: number;      // days after first success (default 1)
  secondInterval: number;       // days after second success (default 6)
  minEaseFactor: number;        // minimum ease (default 1.3)
  failIntervalMinutes: number;  // minutes to wait after first fail (default 10)
  failIntervalGrowth: number;   // multiply fail interval each consecutive fail (default 2)
  leechThreshold: number;       // number of lapses to mark as leech (default 5)
}

export const DEFAULT_SR_SETTINGS: SRSettings = {
  initialInterval: 1,
  secondInterval: 6,
  minEaseFactor: 1.3,
  failIntervalMinutes: 10,
  failIntervalGrowth: 2,
  leechThreshold: 5,
};

export function calculateNextReview(section: Section, grade: number, settings: SRSettings = DEFAULT_SR_SETTINGS): Partial<Section> {
  let { easeFactor, interval, repetitions, lapses } = section;
  lapses = lapses || 0;

  if (grade < 3) {
    // Failed — aggressive sub-day scheduling
    lapses += 1;
    repetitions = 0;

    // Progressive sub-day intervals: 10min -> 20min -> 40min etc.
    const failMinutes = settings.failIntervalMinutes * Math.pow(settings.failIntervalGrowth, Math.min(lapses - 1, 5));
    interval = failMinutes / (24 * 60); // convert to fractional days

    // Penalize ease factor more for lower grades
    easeFactor = Math.max(
      settings.minEaseFactor,
      easeFactor - (0.2 + (2 - grade) * 0.05)
    );
  } else {
    if (repetitions === 0) interval = settings.initialInterval;
    else if (repetitions === 1) interval = settings.secondInterval;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;

    easeFactor = Math.max(
      settings.minEaseFactor,
      easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    );
  }

  return {
    easeFactor,
    interval,
    repetitions,
    lapses,
    nextReview: Date.now() + interval * 24 * 60 * 60 * 1000,
    lastReviewed: Date.now(),
  };
}

export function isLeech(section: Section, settings: SRSettings = DEFAULT_SR_SETTINGS): boolean {
  return (section.lapses || 0) >= settings.leechThreshold;
}

export function formatInterval(interval: number): string {
  if (interval < 1 / 24) {
    return `${Math.round(interval * 24 * 60)}min`;
  } else if (interval < 1) {
    return `${Math.round(interval * 24)}h`;
  } else if (interval < 30) {
    return `${Math.round(interval)}d`;
  } else if (interval < 365) {
    return `${Math.round(interval / 30)}mj`;
  }
  return `${(interval / 365).toFixed(1)}g`;
}

export function createSection(title: string, content: string): Section {
  return {
    id: crypto.randomUUID(),
    title,
    content,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: Date.now(),
    lastReviewed: null,
    lapses: 0,
  };
}

export function createCard(question: string, sections: { title: string; content: string }[], category: string): Card {
  return {
    id: crypto.randomUUID(),
    question,
    sections: sections.map((s) => createSection(s.title, s.content)),
    category,
    createdAt: Date.now(),
    readCount: 0,
  };
}

// A card is due if any of its sections are due
export function getCardNextReview(card: Card): number {
  if (card.sections.length === 0) return Date.now();
  return Math.min(...card.sections.map((s) => s.nextReview));
}

export function getDueCards(cards: Card[]): Card[] {
  const now = Date.now();
  return cards
    .filter((c) => c.sections.some((s) => s.nextReview <= now))
    .sort((a, b) => getCardNextReview(a) - getCardNextReview(b));
}

export function getDueSections(card: Card): Section[] {
  const now = Date.now();
  return card.sections.filter((s) => s.nextReview <= now);
}

// Knowledge score for a section (0-100 based on repetitions and ease factor)
export function getSectionScore(section: Section): number {
  if (section.repetitions === 0) return 0;
  const repScore = Math.min(section.repetitions / 5, 1);
  const easeScore = (section.easeFactor - 1.3) / (2.5 - 1.3);
  return Math.round((repScore * 0.6 + easeScore * 0.4) * 100);
}

export function getCardScore(card: Card): number {
  if (card.sections.length === 0) return 0;
  return Math.round(card.sections.reduce((sum, s) => sum + getSectionScore(s), 0) / card.sections.length);
}

export function getCategoryStats(cards: Card[], category: string) {
  const catCards = cards.filter((c) => c.category === category);
  if (catCards.length === 0) return { score: 0, total: 0, due: 0 };
  const score = Math.round(catCards.reduce((sum, c) => sum + getCardScore(c), 0) / catCards.length);
  const due = catCards.filter((c) => c.sections.some((s) => s.nextReview <= Date.now())).length;
  return { score, total: catCards.length, due };
}

export function getStats(cards: Card[]) {
  const now = Date.now();
  const due = cards.filter((c) => c.sections.some((s) => s.nextReview <= now)).length;
  const totalSections = cards.reduce((sum, c) => sum + c.sections.length, 0);
  const learnedSections = cards.reduce((sum, c) => sum + c.sections.filter((s) => s.repetitions > 0).length, 0);
  const total = cards.length;
  const leechCount = cards.reduce((sum, c) => sum + c.sections.filter((s) => isLeech(s)).length, 0);
  return { due, total, totalSections, learnedSections, leechCount };
}
