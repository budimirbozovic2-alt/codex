import { stripHtmlText } from "@/lib/sanitize";

export interface SectionInput {
  title: string;
  content: string;
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
    if (sections.some(s => !stripHtmlText(s.content))) {
      errors.sections = "Sve cjeline moraju imati sadržaj.";
    }
  }
  return errors;
}
