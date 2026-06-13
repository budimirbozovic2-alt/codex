// Centralized log interfaces for the Memoria-MNE ecosystem.
// These are used by both the persistence layer (SQLite) and the analytical engines.

export interface ReviewLogEntry {
  timestamp: number;
  cardId: string;
  sectionId: string;
  grade: number;
  category: string;
  // ── Adaptive scheduling explanation (optional, added v6.x) ──
  reasons?: { code: string; label: string }[];
  effectiveRetention?: number;
  intervalMultiplier?: number;
}

export interface PomodoroLogEntry {
  timestamp: number;
  type: "focus" | "break";
  durationMinutes: number;
}

type LearnMode = "active-recall";

export interface LearnCardProgress {
  mode: LearnMode;
  currentModule: number;
  completedModules: number[];
  chainPosition: number;
  phase: "preview" | "drill" | "learn" | "chainReview" | "open" | "recall" | "reveal";
  completed: boolean;
  leech?: boolean;
  failedAttempts?: number;
}
