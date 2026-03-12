import { Card, createSection, SRSettings, DEFAULT_SR_SETTINGS } from "./spaced-repetition";

const CARDS_KEY = "sr-essay-cards";
const CATEGORIES_KEY = "sr-essay-categories";
const REVIEW_LOG_KEY = "sr-review-log";
const SR_SETTINGS_KEY = "sr-settings";

export interface ReviewLogEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  grade: number;
  category: string;
}

function migrateCard(card: any): Card {
  if (!card.sections) {
    return {
      id: card.id,
      question: card.question,
      sections: [createSection("Cjelina 1", card.answer || "")],
      category: card.category || "Opšte",
      createdAt: card.createdAt || Date.now(),
      readCount: card.readCount || 0,
    };
  }
  return { ...card, readCount: card.readCount || 0 };
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
