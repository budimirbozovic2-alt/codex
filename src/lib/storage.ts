import { Card, createSection, SRSettings, DEFAULT_SR_SETTINGS, SectionState } from "./spaced-repetition";

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
  const migrated = {
    ...s,
    lapses: s.lapses || 0,
    stability: s.stability ?? 0,
    difficulty: s.difficulty ?? 5,
    elapsedDays: s.elapsedDays ?? 0,
    scheduledDays: s.scheduledDays ?? (s.interval || 0),
  };

  // Migrate state field
  if (s.state === undefined) {
    if (s.lastReviewed === null || s.lastReviewed === undefined) {
      migrated.state = SectionState.New;
    } else if (s.stability > 0 && s.interval > 1) {
      migrated.state = SectionState.Review;
    } else {
      migrated.state = SectionState.Learning;
    }
  }

  // If section has old SM-2 fields but no FSRS stability, estimate from old data
  if (s.stability === undefined && s.easeFactor !== undefined) {
    if (s.repetitions > 0 && s.interval > 0) {
      migrated.stability = s.interval / (Math.log(0.95) / Math.log(0.9));
      migrated.difficulty = Math.max(1, Math.min(10, Math.round(10 - (s.easeFactor - 1.3) * (7 / 1.2))));
      migrated.state = SectionState.Review;
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
    tags: card.tags || [],
    errorLog: card.errorLog || [],
    sections: (card.sections || []).map(migrateSection),
  };
}

// Generic localStorage helpers
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Cards
export function loadCards(): Card[] {
  try {
    const data = localStorage.getItem(CARDS_KEY);
    return data ? (JSON.parse(data) as any[]).map(migrateCard) : [];
  } catch {
    return [];
  }
}

export function saveCards(cards: Card[]) {
  saveToStorage(CARDS_KEY, cards);
}

// Categories
export function loadCategories(): string[] {
  return loadFromStorage(CATEGORIES_KEY, ["Opšte"]);
}

export function saveCategories(categories: string[]) {
  saveToStorage(CATEGORIES_KEY, categories);
}

// Subcategories
export function loadSubcategories(): Record<string, string[]> {
  return loadFromStorage(SUBCATEGORIES_KEY, {});
}

export function saveSubcategories(subcategories: Record<string, string[]>) {
  saveToStorage(SUBCATEGORIES_KEY, subcategories);
}

// Review Log
export function loadReviewLog(): ReviewLogEntry[] {
  return loadFromStorage(REVIEW_LOG_KEY, []);
}

export function saveReviewLog(log: ReviewLogEntry[]) {
  saveToStorage(REVIEW_LOG_KEY, log);
}

export function addReviewLogEntry(entry: ReviewLogEntry) {
  const log = loadReviewLog();
  log.push(entry);
  saveReviewLog(log);
}

// SR Settings
export function loadSRSettings(): SRSettings {
  try {
    const data = localStorage.getItem(SR_SETTINGS_KEY);
    return data ? { ...DEFAULT_SR_SETTINGS, ...JSON.parse(data) } : DEFAULT_SR_SETTINGS;
  } catch {
    return DEFAULT_SR_SETTINGS;
  }
}

export function saveSRSettings(settings: SRSettings) {
  saveToStorage(SR_SETTINGS_KEY, settings);
}

// Pomodoro log
const POMODORO_LOG_KEY = "sr-pomodoro-log";

export interface PomodoroLogEntry {
  timestamp: number;
  type: "focus" | "break";
  durationMinutes: number;
}

export function loadPomodoroLog(): PomodoroLogEntry[] {
  return loadFromStorage(POMODORO_LOG_KEY, []);
}

export function savePomodoroLog(log: PomodoroLogEntry[]) {
  saveToStorage(POMODORO_LOG_KEY, log);
}

export function addPomodoroEntry(entry: PomodoroLogEntry) {
  const log = loadPomodoroLog();
  log.push(entry);
  savePomodoroLog(log);
}

export function getPomodoroStats() {
  const log = loadPomodoroLog();
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = todayStart - new Date().getDay() * 86400000;

  const focusSessions = log.filter((e) => e.type === "focus");
  const today = focusSessions.filter((e) => e.timestamp >= todayStart);
  const week = focusSessions.filter((e) => e.timestamp >= weekStart);

  return {
    today: today.length,
    todayMinutes: today.reduce((s, e) => s + e.durationMinutes, 0),
    week: week.length,
    weekMinutes: week.reduce((s, e) => s + e.durationMinutes, 0),
    total: focusSessions.length,
  };
}

// Storage usage
const APP_KEYS = [CARDS_KEY, CATEGORIES_KEY, SUBCATEGORIES_KEY, REVIEW_LOG_KEY, SR_SETTINGS_KEY, POMODORO_LOG_KEY];
const MAX_STORAGE_BYTES = 5 * 1024 * 1024; // 5MB

export function getStorageUsage(): { usedBytes: number; maxBytes: number; percent: number } {
  let usedBytes = 0;
  for (const key of APP_KEYS) {
    const val = localStorage.getItem(key);
    if (val) usedBytes += key.length + val.length * 2; // UTF-16
  }
  return { usedBytes, maxBytes: MAX_STORAGE_BYTES, percent: Math.round((usedBytes / MAX_STORAGE_BYTES) * 100) };
}

// Backup reminder
const LAST_BACKUP_KEY = "sr-last-backup";
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getLastBackupTime(): number {
  return loadFromStorage(LAST_BACKUP_KEY, 0);
}

export function setLastBackupTime() {
  saveToStorage(LAST_BACKUP_KEY, Date.now());
}

export function isBackupOverdue(): boolean {
  const last = getLastBackupTime();
  if (last === 0) return false; // don't nag on first use
  return Date.now() - last > BACKUP_INTERVAL_MS;
}
