// Builder/factory functions for Section, Card, and FlashCard.
import { Section, SectionState, Card, ErrorLogEntry, ErrorStatus } from "./types";
import type { EditorDoc } from "@/lib/editor-v4/types";
import { htmlToDoc } from "@/lib/editor-v4";

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

function ensureDoc(content: string, doc?: EditorDoc): EditorDoc {
  if (doc && doc.version === 4) return doc;
  if (!content || !content.trim()) return EMPTY_DOC;
  return htmlToDoc(content);
}

export function createSection(title: string, content: string, contentDoc?: EditorDoc): Section {
  return {
    id: crypto.randomUUID(),
    title,
    contentDoc: ensureDoc(content, contentDoc),
    state: SectionState.New,
    stability: 0,
    difficulty: 5,
    interval: 0,
    nextReview: Date.now(),
    lastReviewed: null,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    firstReviewPending: false,
  };
}

export function createCard(question: string, sections: { title: string; content: string; contentDoc?: EditorDoc }[], categoryId: string, subcategoryId?: string): Card {
  return {
    id: crypto.randomUUID(),
    question,
    sections: sections.map((s) => createSection(s.title, s.content, s.contentDoc)),
    categoryId,
    subcategoryId: subcategoryId || "",
    createdAt: Date.now(),
    readCount: 0,
    type: "essay",
  };
}

export function createFlashCard(question: string, answer: string, categoryId: string, subcategoryId?: string): Card {
  return {
    id: crypto.randomUUID(),
    question,
    sections: [createSection("Odgovor", answer)],
    categoryId,
    subcategoryId: subcategoryId || "",
    createdAt: Date.now(),
    readCount: 0,
    type: "flash",
  };
}

// Error-status classifier — pure utility, lives with factories for cohesion.
export function getErrorStatus(entry: ErrorLogEntry): ErrorStatus {
  if (entry.successStreak >= 5) return "mastered";
  if (entry.recentSuccesses > entry.count) return "recovering";
  return "critical";
}
