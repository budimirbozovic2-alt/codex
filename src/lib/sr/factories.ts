// Builder/factory functions for Section, Card, and FlashCard.
import { Section, SectionState, Card } from "./types";
import type { EditorDoc } from "@/lib/editor-v4/types";
import { htmlToDoc } from "@/lib/editor-v4";
import { newUuid } from "@/lib/ids";

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

export function createSection(title: string, contentDoc: EditorDoc = EMPTY_DOC): Section {
  return {
    id: newUuid(),
    title,
    contentDoc: contentDoc && contentDoc.version === 4 ? contentDoc : EMPTY_DOC,
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

export function createCard(
  question: string,
  sections: { title: string; contentDoc: EditorDoc }[],
  categoryId: string,
  subcategoryId?: string,
): Card {
  return {
    id: newUuid(),
    question,
    sections: sections.map((s) => createSection(s.title, s.contentDoc)),
    categoryId,
    subcategoryId: subcategoryId || "",
    createdAt: Date.now(),
    readCount: 0,
    type: "essay",
  };
}

export function createFlashCard(question: string, answer: string, categoryId: string, subcategoryId?: string): Card {
  return {
    id: newUuid(),
    question,
    sections: [createSection("Odgovor", htmlToDoc(answer))],
    categoryId,
    subcategoryId: subcategoryId || "",
    createdAt: Date.now(),
    readCount: 0,
    type: "flash",
  };
}

// Error-status classifier — pure utility, lives with factories for cohesion.
export { getErrorStatus } from "./error-status";
