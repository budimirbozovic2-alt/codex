import { Card, createSection, SRSettings, DEFAULT_SR_SETTINGS } from "./spaced-repetition";

const CARDS_KEY = "sr-essay-cards";
const CATEGORIES_KEY = "sr-essay-categories";
const SUBCATEGORIES_KEY = "sr-essay-subcategories";
const REVIEW_LOG_KEY = "sr-review-log";
const SR_SETTINGS_KEY = "sr-settings";

export interface ReviewLogEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  grade: number;
  category: string;
}

function migrateSection(s: any): any {
  // Migrate from SM-2 to FSRS v5
  const migrated = {
    ...s,
    lapses: s.lapses || 0,
    stability: s.stability ?? 0,
    difficulty: s.difficulty ?? 5,
  };

  // If section has old SM-2 fields but no FSRS stability, estimate from old data
  if (s.stability === undefined && s.easeFactor !== undefined) {
    if (s.repetitions > 0 && s.interval > 0) {
      // Estimate stability from old interval
      migrated.stability = s.interval / (Math.log(0.95) / Math.log(0.9));
      // Estimate difficulty from easeFactor (EF 2.5 → D=5, EF 1.3 → D=9)
      migrated.difficulty = Math.max(1, Math.min(10, Math.round(10 - (s.easeFactor - 1.3) * (7 / 1.2))));
    }
  }

  // Clean up legacy fields
  delete migrated.easeFactor;
  delete migrated.repetitions;

  return migrated;
}

function migrateCard(card: any): Card {
  if (!card.sections) {
    return {
      id: card.id,
      question: card.question,
      sections: [createSection("Cjelina 1", card.answer || "")],
      category: card.category || "Opšte",
      subcategory: card.subcategory || "",
      createdAt: card.createdAt || Date.now(),
      readCount: card.readCount || 0,
      type: card.type || "essay",
    };
  }
  return {
    ...card,
    readCount: card.readCount || 0,
    type: card.type || "essay",
    subcategory: card.subcategory || "",
    sections: (card.sections || []).map(migrateSection),
  };
}

export function loadCards(): Card[] {
  try {
    const data = localStorage.getItem(CARDS_KEY);
    return data ? (JSON.parse(data) as any[]).map(migrateCard) : [];
  } catch {
    return [];
  }
}

export function saveCards(cards: Card[]) {
  localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
}

export function loadCategories(): string[] {
  try {
    const data = localStorage.getItem(CATEGORIES_KEY);
    return data ? JSON.parse(data) : ["Opšte"];
  } catch {
    return ["Opšte"];
  }
}

export function saveCategories(categories: string[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

export function loadSubcategories(): Record<string, string[]> {
  try {
    const data = localStorage.getItem(SUBCATEGORIES_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function saveSubcategories(subcategories: Record<string, string[]>) {
  localStorage.setItem(SUBCATEGORIES_KEY, JSON.stringify(subcategories));
}

export function loadReviewLog(): ReviewLogEntry[] {
  try {
    const data = localStorage.getItem(REVIEW_LOG_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveReviewLog(log: ReviewLogEntry[]) {
  localStorage.setItem(REVIEW_LOG_KEY, JSON.stringify(log));
}

export function addReviewLogEntry(entry: ReviewLogEntry) {
  const log = loadReviewLog();
  log.push(entry);
  saveReviewLog(log);
}

export function loadSRSettings(): SRSettings {
  try {
    const data = localStorage.getItem(SR_SETTINGS_KEY);
    return data ? { ...DEFAULT_SR_SETTINGS, ...JSON.parse(data) } : DEFAULT_SR_SETTINGS;
  } catch {
    return DEFAULT_SR_SETTINGS;
  }
}

export function saveSRSettings(settings: SRSettings) {
  localStorage.setItem(SR_SETTINGS_KEY, JSON.stringify(settings));
}
