// FSRS v5 — Domain types only (no runtime logic). Re-exported via spaced-repetition.ts.
export type { ExaminerProfile } from "../db-schema";
import type { EditorDoc } from "@/lib/editor-v4/types";

export enum SectionState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

export interface Section {
  id: string;
  title: string;
  /**
   * PR-7b: canonical AST is the ONLY content payload. Legacy `content` (HTML)
   * column was deleted in Dexie v22. Read-sites that need text/html/markdown
   * derive lazily via `deriveHtml` / `derivePlainText` / `deriveMarkdown` from
   * `src/lib/editor-v4/derived.ts` (WeakMap-cached per doc reference).
   */
  contentDoc: EditorDoc;
  state: SectionState;
  stability: number;
  difficulty: number;
  interval: number;
  nextReview: number;
  lastReviewed: number | null;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  firstReviewPending: boolean;
}

export interface ErrorLogEntry {
  text: string;
  count: number;
  recentSuccesses: number;
  successStreak: number;
  category?: string;
  lastMissed: string;
}

export type ErrorStatus = "critical" | "recovering" | "mastered";

export interface SourceModule {
  id: string;
  order: number;
  articleNum?: string;
  title: string;
  question: string;
  textAnchor: string;
  originalSourceSnippet: string;
}

export type FrequencyTag = "često" | "rijetko" | "nikad";
export type CardSourceType = "skripta" | "zakon";
/** Audit-requested alias for CardSourceType. */
export type SourceType = CardSourceType;

export interface Card {
  id: string;
  question: string;
  sections: Section[];
  categoryId: string;        // FK → categories.id
  subcategoryId?: string;    // FK → SubcategoryNode.id (UUID)
  chapterId?: string;        // FK → ChapterNode.id (UUID)
  chapterOrder?: number;
  createdAt: number;
  updatedAt?: number;
  readCount: number;
  type: "essay" | "flash";
  tags?: string[];
  errorLog?: ErrorLogEntry[];
  sortOrder?: number;
  sourceId?: string;
  textAnchor?: string;
  needsReview?: boolean;
  keyParts?: string[];
  originalSourceSnippet?: string;
  childCardIds?: string[];
  sourceModules?: SourceModule[];
  frequencyTag?: FrequencyTag;
  sourceType?: CardSourceType;
}

export interface ReviewGrade {
  label: string;
  value: number;
  description: string;
  color: string;
}

export interface SRSettings {
  leechThreshold: number;
  dailyGoal: number;
  resistanceWeights: { lapses: number; latency: number; forgetting: number };
}

export const DEFAULT_SR_SETTINGS: SRSettings = {
  leechThreshold: 5,
  dailyGoal: 20,
  resistanceWeights: { lapses: 40, latency: 30, forgetting: 30 },
};
