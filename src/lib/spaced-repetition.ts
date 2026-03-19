// FSRS v5 Algorithm with per-section tracking, state machine, leech detection

export enum SectionState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

export interface Section {
  id: string;
  title: string;
  content: string;
  state: SectionState;          // FSRS state machine
  stability: number;            // FSRS stability (days)
  difficulty: number;           // FSRS difficulty (1-10)
  interval: number;             // in days
  nextReview: number;           // timestamp
  lastReviewed: number | null;
  lapses: number;               // count of "Again" presses
  elapsedDays: number;          // days since last review
  scheduledDays: number;        // days that were scheduled
  firstReviewPending: boolean;  // 20-min rule: waiting for first repetition
}

export interface ErrorLogEntry {
  text: string;
  count: number;
  recentSuccesses: number;
  successStreak: number;
  category?: string;
  lastMissed: string; // ISO date string
}

export type ErrorStatus = "critical" | "recovering" | "mastered";

export function getErrorStatus(entry: ErrorLogEntry): ErrorStatus {
  if (entry.successStreak >= 5) return "mastered";
  if (entry.recentSuccesses > entry.count) return "recovering";
  return "critical";
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
  tags?: string[];
  errorLog?: ErrorLogEntry[];
}

export const CARD_TAGS = [
  { id: "često-na-ispitu", label: "Često dolazi na ispitu", color: "destructive" },
  { id: "rijetko-na-ispitu", label: "Rijetko dolazi na ispitu", color: "secondary" },
] as const;

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

function getElapsedDays(section: Section): number {
  if (!section.lastReviewed) return 0;
  return (Date.now() - section.lastReviewed) / (24 * 60 * 60 * 1000);
}

function nextState(currentState: SectionState, grade: number): SectionState {
  switch (currentState) {
    case SectionState.New:
      return grade === 1 ? SectionState.Learning : grade <= 3 ? SectionState.Learning : SectionState.Review;
    case SectionState.Learning:
      return grade === 1 ? SectionState.Learning : SectionState.Review;
    case SectionState.Review:
      return grade === 1 ? SectionState.Relearning : SectionState.Review;
    case SectionState.Relearning:
      return grade === 1 ? SectionState.Relearning : SectionState.Review;
    default:
      return SectionState.Review;
  }
}

export function calculateNextReview(section: Section, grade: number): Partial<Section> {
  let newStability: number;
  let newDifficulty: number;
  let newLapses = section.lapses || 0;
  const elapsed = getElapsedDays(section);

  const isNew = section.state === SectionState.New;
  const newState = nextState(section.state, grade);

  const isPendingFirstReview = section.firstReviewPending === true;

  if (isNew) {
    const init = INITIAL_VALUES[grade] || INITIAL_VALUES[3];
    newStability = init.stability;
    newDifficulty = init.difficulty;
    if (grade === 1) newLapses += 1;
  } else {
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

  // 20-minute rule: new cards graded 3 or 4 get a short first review
  let finalNextReview = Date.now() + interval * 24 * 60 * 60 * 1000;
  let finalState = newState;
  let finalFirstReviewPending = false;

  if (isNew && grade >= 3) {
    // Schedule first review in 15-20 minutes, stay in Learning
    const delayMs = grade === 3 ? 15 * 60 * 1000 : 20 * 60 * 1000;
    finalNextReview = Date.now() + delayMs;
    finalState = SectionState.Learning;
    finalFirstReviewPending = true;
  } else if (isPendingFirstReview && grade >= 3) {
    // First review completed successfully — now transition to Review
    finalState = SectionState.Review;
    finalFirstReviewPending = false;
  } else if (isPendingFirstReview && grade < 3) {
    // Failed first review — stay pending, short interval again
    finalNextReview = Date.now() + 10 * 60 * 1000;
    finalState = SectionState.Learning;
    finalFirstReviewPending = true;
  }

  return {
    state: finalState,
    stability: newStability,
    difficulty: newDifficulty,
    interval,
    lapses: newLapses,
    elapsedDays: elapsed,
    scheduledDays: interval,
    nextReview: finalNextReview,
    lastReviewed: Date.now(),
    firstReviewPending: finalFirstReviewPending,
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
    state: SectionState.New,
    stability: 0,
    difficulty: 5,
    interval: 0,
    nextReview: Date.now(),
    lastReviewed: null,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
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

// Retrievability: probability of recall at this moment (0-100%)
export function getRetrievability(section: Section): number {
  if (section.state === SectionState.New) return 0;
  if (section.stability <= 0) return 0;
  const elapsed = section.lastReviewed
    ? (Date.now() - section.lastReviewed) / (24 * 60 * 60 * 1000)
    : 0;
  // R = e^(-elapsed/stability)  — FSRS power forgetting curve
  const r = Math.exp(-elapsed / section.stability);
  return Math.round(Math.max(0, Math.min(100, r * 100)));
}

export function getCardRetrievability(card: Card): number {
  if (card.sections.length === 0) return 0;
  const reviewed = card.sections.filter((s) => s.state !== SectionState.New);
  if (reviewed.length === 0) return 0;
  return Math.round(reviewed.reduce((sum, s) => sum + getRetrievability(s), 0) / reviewed.length);
}

export function getSectionScore(section: Section): number {
  if (section.state === SectionState.New) return 0;
  const stabilityScore = Math.min(section.stability / 30, 1);
  const difficultyBonus = (10 - section.difficulty) / 9;
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
  const learnedSections = cards.reduce((sum, c) => sum + c.sections.filter((s) => s.state !== SectionState.New).length, 0);
  const total = cards.length;
  const leechCount = cards.reduce((sum, c) => sum + c.sections.filter((s) => isLeech(s)).length, 0);
  return { due, total, totalSections, learnedSections, leechCount };
}
