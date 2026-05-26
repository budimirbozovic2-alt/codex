import { stripHtmlText } from "@/lib/sanitize";
import type { EditorDoc } from "@/lib/editor-v4/types";

export interface SectionInput {
  title: string;
  /** @deprecated PR-7b: legacy HTML. Use `contentDoc` for new writes. */
  content?: string;
  /** PR-7b: canonical AST — primary write payload. */
  contentDoc: EditorDoc;
}

export type CardType = "essay" | "flash";
export type FormWidth = "compact" | "normal" | "wide" | "full";

export interface ValidationErrors {
  question?: string;
  flashAnswer?: string;
  sections?: string;
}

export function parseHtmlToParagraphs(html: string): string[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const blocks: string[] = [];
  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (["p", "div", "br", "li"].includes(tag)) {
        const inner = el.innerHTML.trim();
        if (inner && inner !== "<br>") blocks.push(inner);
      } else {
        const outer = el.outerHTML.trim();
        if (outer) blocks.push(outer);
      }
    }
  };
  if (div.children.length === 0) {
    const parts = html.split(/<br\s*\/?>/gi).map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [html];
  }
  div.childNodes.forEach(processNode);
  return blocks.length > 0 ? blocks : [html];
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
    if (sections.some(s => {
      const fromDoc = s.contentDoc ? sectionPlainTextLen(s.contentDoc) : 0;
      const fromLegacy = s.content ? stripHtmlText(s.content).length : 0;
      return fromDoc === 0 && fromLegacy === 0;
    })) {
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
