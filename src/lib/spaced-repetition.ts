// SM-2 Algorithm with per-section tracking

export interface Section {
  id: string;
  title: string;
  content: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReviewed: number | null;
}

export interface Card {
  id: string;
  question: string;
  sections: Section[];
  category: string;
  createdAt: number;
}

export interface ReviewGrade {
  label: string;
  value: number;
  description: string;
  color: string;
}

export const GRADES: ReviewGrade[] = [
  { label: "Ponovi", value: 0, description: "Potpuno zaboravljeno", color: "destructive" },
  { label: "Teško", value: 3, description: "Značajan napor", color: "warning" },
  { label: "Dobro", value: 4, description: "Mali napor", color: "primary" },
  { label: "Lako", value: 5, description: "Savršeno", color: "success" },
];

export function calculateNextReview(section: Section, grade: number): Partial<Section> {
  let { easeFactor, interval, repetitions } = section;

  if (grade < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  }

  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  );

  return {
    easeFactor,
    interval,
    repetitions,
    nextReview: Date.now() + interval * 24 * 60 * 60 * 1000,
    lastReviewed: Date.now(),
  };
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
  };
}

export function createCard(question: string, sections: { title: string; content: string }[], category: string): Card {
  return {
    id: crypto.randomUUID(),
    question,
    sections: sections.map((s) => createSection(s.title, s.content)),
    category,
    createdAt: Date.now(),
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
  const repScore = Math.min(section.repetitions / 5, 1); // max out at 5 reps
  const easeScore = (section.easeFactor - 1.3) / (2.5 - 1.3); // normalize 1.3-2.5 to 0-1
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
  return { due, total, totalSections, learnedSections };
}
