import { stripHtmlText } from "@/lib/sanitize";
import type { EditorDoc } from "@/lib/editor-v4/types";

export interface SectionInput {
  title: string;
  /** Canonical V4 AST — sole section body SSOT. */
  contentDoc: EditorDoc;
}

export type CardType = "essay" | "flash";
export type FormWidth = "compact" | "normal" | "wide" | "full";

export interface ValidationErrors {
  question?: string;
  flashAnswer?: string;
  sections?: string;
}

export function validate(
  cardType: CardType,
  question: string,
  flashAnswer: string,
  sections: SectionInput[],
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!stripHtmlText(question)) {
    errors.question = "Pitanje ne smije biti prazno.";
  }
  if (cardType === "flash") {
    if (!stripHtmlText(flashAnswer)) {
      errors.flashAnswer = "Odgovor ne smije biti prazan.";
    }
  } else {
    // PR-7b: validate from AST plain text — keystroke loop no longer maintains
    // a derived `content` HTML string on every change.
    if (sections.some((s) => sectionPlainTextLen(s.contentDoc) === 0)) {
      errors.sections = "Sve cjeline moraju imati sadržaj.";
    }
  }
  return errors;
}

function sectionPlainTextLen(doc: EditorDoc): number {
  // Inline cheap walker — avoids importing the WeakMap shim from the hot path.
  let len = 0;
  const walk = (n: { type?: string; text?: string; content?: unknown[] } | undefined) => {
    if (!n) return;
    if (n.type === "text" && typeof n.text === "string") len += n.text.trim().length;
    if (Array.isArray(n.content)) for (const c of n.content) walk(c as typeof n);
  };
  walk(doc.content as Parameters<typeof walk>[0]);
  return len;
}
