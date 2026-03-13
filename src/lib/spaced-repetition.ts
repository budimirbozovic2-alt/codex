// Simplified FSRS v5 Algorithm with per-section tracking, leech detection

export interface Section {
  id: string;
  title: string;
  content: string;
  stability: number;       // FSRS stability (days)
  difficulty: number;      // FSRS difficulty (1-10)
  interval: number;        // in days
  nextReview: number;      // timestamp
  lastReviewed: number | null;
  lapses: number;          // count of "Again" presses
  // Legacy fields kept for migration compatibility
  easeFactor?: number;
  repetitions?: number;
}

export interface Card {
  id: string;
  question: string;
  sections: Section[];
  category: string;
  subcategory?: string;
  createdAt: number;
  readCount: number;
  type: "essay" | "flash";
}

export interface ReviewGrade {
  label: string;
  value: number;
  description: string;
  color: string;
}

export const GRADES: ReviewGrade[] = [
  { label: "Opet", value: 1, description: "Zaboravljeno", color: "destructive" },
  { label: "Teško", value: 2, description: "Značajan napor", color: "warning" },
  { label: "Dobro", value: 3, description: "Umjeren napor", color: "primary" },
  { label: "Lako", value: 4, description: "Savršeno", color: "success" },
];

export interface SRSettings {
  leechThreshold: number;
  dailyGoal: number;
}

export const DEFAULT_SR_SETTINGS: SRSettings = {
  leechThreshold: 5,
  dailyGoal: 20,
};

// FSRS interval calculation targeting 95% retention
export function calculateInterval(stability: number): number {
  if (stability <= 0) return 0;
  return stability * (Math.log(0.95) / Math.log(0.9));
}

// Initial values for new cards (first review)
const INITIAL_VALUES: Record<number, { stability: number; difficulty: number }> = {
  1: { stability: 0.1, difficulty: 6 },
  2: { stability: 1, difficulty: 5 },
  3: { stability: 3, difficulty: 4 },
  4: { stability: 7, difficulty: 3 },
};

function clampDifficulty(d: number): number {
  return Math.max(1, Math.min(10, d));
}

export function calculateNextReview(section: Section, grade: number): Partial<Section> {
  let newStability: number;
  let newDifficulty: number;
  let newLapses = section.lapses || 0;

  const isNew = section.stability === 0 && section.lastReviewed === null;

  if (isNew) {
    // First review ever — use initial values
    const init = INITIAL_VALUES[grade] || INITIAL_VALUES[3];
    newStability = init.stability;
    newDifficulty = init.difficulty;
    if (grade === 1) newLapses += 1;
  } else {
    // Subsequent reviews
    const { stability, difficulty } = section;
    switch (grade) {
      case 1: // Again
        newDifficulty = clampDifficulty(difficulty + 2);
        newStability = Math.max(0.1, stability * 0.1);
        newLapses += 1;
        break;
      case 2: // Hard
        newDifficulty = clampDifficulty(difficulty + 1);
        newStability = stability * 1.5 + 0.5;
        break;
      case 3: // Good
        newDifficulty = clampDifficulty(difficulty);
        newStability = stability * 3.0 + 1.0;
        break;
      case 4: // Easy
        newDifficulty = clampDifficulty(difficulty - 1);
        newStability = stability * 5.0 + 2.0;
        break;
      default:
        newDifficulty = difficulty;
        newStability = stability;
    }
  }

  const interval = Math.max(calculateInterval(newStability), 1 / (24 * 60)); // minimum 1 minute

  return {
    stability: newStability,
    difficulty: newDifficulty,
    interval,
    lapses: newLapses,
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

// Preview what the next interval would be for each grade
export function previewIntervals(section: Section): Record<number, string> {
  const result: Record<number, string> = {};
  for (const grade of [1, 2, 3, 4]) {
    const next = calculateNextReview(section, grade);
    result[grade] = formatInterval(next.interval || 0);
  }
  return result;
}

export function createSection(title: string, content: string): Section {
  return {
    id: crypto.randomUUID(),
    title,
    content,
    stability: 0,
    difficulty: 5,
    interval: 0,
    nextReview: Date.now(),
    lastReviewed: null,
    lapses: 0,
  };
}

export function createCard(question: string, sections: { title: string; content: string }[], category: string, subcategory?: string): Card {
  return {
    id: crypto.randomUUID(),
    question,
    sections: sections.map((s) => createSection(s.title, s.content)),
    category,
    subcategory: subcategory || "",
    createdAt: Date.now(),
    readCount: 0,
    type: "essay",
  };
}

export function createFlashCard(question: string, answer: string, category: string, subcategory?: string): Card {
  return {
    id: crypto.randomUUID(),
    question,
    sections: [createSection("Odgovor", answer)],
    category,
    subcategory: subcategory || "",
    createdAt: Date.now(),
    readCount: 0,
    type: "flash",
  };
}

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

// Score based on stability: higher stability = better mastery
export function getSectionScore(section: Section): number {
  if (section.stability === 0 && section.lastReviewed === null) return 0;
  // Map stability to 0-100: stability of 30+ days = ~100%
  const stabilityScore = Math.min(section.stability / 30, 1);
  // Penalize high difficulty slightly
  const difficultyBonus = (10 - section.difficulty) / 9; // 1.0 for difficulty=1, 0 for difficulty=10
  return Math.round((stabilityScore * 0.7 + difficultyBonus * 0.3) * 100);
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
  const learnedSections = cards.reduce((sum, c) => sum + c.sections.filter((s) => s.lastReviewed !== null).length, 0);
  const total = cards.length;
  const leechCount = cards.reduce((sum, c) => sum + c.sections.filter((s) => isLeech(s)).length, 0);
  return { due, total, totalSections, learnedSections, leechCount };
}
