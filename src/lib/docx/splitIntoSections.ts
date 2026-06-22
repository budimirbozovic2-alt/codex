/**
 * Pure DOCX/HTML splitting utilities used by the DOCX importer wizard.
 *
 * No React, no DOM mutation, no storage — strictly input → output. Tests
 * can drive these directly via JSDOM without rendering any component.
 *
 * Behaviour mirrors the original inline implementation that lived inside
 * `DocxImporter.tsx`. Two-pass design: first split the document into card
 * envelopes (question + collected content), then for each envelope split
 * the content into named sections. Output sections carry `contentDoc` (V4 AST).
 */

import { htmlToDoc } from "@/lib/editor-v4";
import type { EditorDoc } from "@/lib/editor-v4/types";
import { extractBoldPeriodModuleStart } from "./bold-period-split";

export type HeadingLevel = "h1" | "h2" | "h3";
export type SplitMode = "heading" | "delimiter" | "bold-period";

export interface SectionSplitOpts {
  mode: SplitMode;
  heading: HeadingLevel;
  delimiter: string;
}

export interface CardSplitOpts {
  mode: SplitMode;
  heading: HeadingLevel;
  delimiter: string;
}

interface ParsedSection {
  title: string;
  contentDoc: EditorDoc;
}

export interface ParsedCard {
  question: string;
  sections: ParsedSection[];
}

/**
 * Split a chunk of HTML belonging to a single card into named sections.
 *
 * - `heading` mode: every `<hX>` element of the configured level starts a
 *   new section. Non-heading elements are appended to the current section.
 * - `delimiter` mode: a paragraph whose trimmed text starts with the
 *   delimiter becomes the section title. Empty delimiter = single section.
 * - `bold-period` mode: script-style modules where a leading bold phrase
 *   ends with a period (e.g. `<strong>Modul.</strong>`).
 *
 * If no sections are detected, the entire HTML is returned as a single
 * section titled "Odgovor" (preserves original fallback behaviour).
 */
function splitIntoSections(
  contentHtml: string,
  opts: SectionSplitOpts,
): ParsedSection[] {
  if (!contentHtml.trim()) return [];

  const tempDoc = new DOMParser().parseFromString(contentHtml, "text/html");
  const elements = Array.from(tempDoc.body.children);
  const sections: ParsedSection[] = [];
  let secTitle = "";
  let secContent = "";

  const flushSec = () => {
    if (secContent.trim()) {
      sections.push({
        title: secTitle || `Cjelina ${sections.length + 1}`,
        contentDoc: htmlToDoc(secContent.trim()),
      });
    }
    secTitle = "";
    secContent = "";
  };

  if (opts.mode === "heading") {
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      if (tag === opts.heading) {
        flushSec();
        secTitle = el.textContent?.trim() ?? "";
      } else {
        secContent += el.outerHTML + "\n";
      }
    }
  } else if (opts.mode === "bold-period") {
    for (const el of elements) {
      const moduleStart = extractBoldPeriodModuleStart(el);
      if (moduleStart) {
        flushSec();
        secTitle = moduleStart.title;
        if (moduleStart.bodyHtml.trim()) {
          secContent += moduleStart.bodyHtml + "\n";
        }
      } else {
        secContent += el.outerHTML + "\n";
      }
    }
  } else {
    const secDelim = opts.delimiter.trim();
    if (secDelim) {
      for (const el of elements) {
        const text = el.textContent?.trim() ?? "";
        if (text.startsWith(secDelim)) {
          flushSec();
          secTitle = text;
        } else {
          secContent += el.outerHTML + "\n";
        }
      }
    } else {
      // No delimiter specified — single section
      return [{ title: "Odgovor", contentDoc: htmlToDoc(contentHtml.trim()) }];
    }
  }

  flushSec();
  return sections.length > 0
    ? sections
    : [{ title: "Odgovor", contentDoc: htmlToDoc(contentHtml.trim()) }];
}

/**
 * Walk the whole sanitized DOCX-derived HTML and split it into card
 * envelopes (question + content), then delegate section-splitting per
 * envelope to {@link splitIntoSections}. Returns an empty list when the
 * card splitter is in `delimiter` mode with an empty delimiter (matches
 * the original early-return behaviour, which produced zero cards).
 */
export function splitIntoCards(
  htmlContent: string,
  cardOpts: CardSplitOpts,
  sectionOpts: SectionSplitOpts,
): ParsedCard[] {
  if (!htmlContent) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  const elements = Array.from(doc.body.children);
  const cards: ParsedCard[] = [];
  let currentQuestion = "";
  let currentContent = "";

  const flushCard = () => {
    if (currentQuestion.trim() && currentContent.trim()) {
      const sections = splitIntoSections(currentContent, sectionOpts);
      if (sections.length > 0) {
        cards.push({ question: currentQuestion.trim(), sections });
      }
    }
    currentQuestion = "";
    currentContent = "";
  };

  if (cardOpts.mode === "heading") {
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      if (tag === cardOpts.heading) {
        flushCard();
        currentQuestion = el.textContent?.trim() ?? "";
      } else if (currentQuestion) {
        currentContent += el.outerHTML + "\n";
      }
    }
  } else {
    const delim = cardOpts.delimiter.trim();
    if (!delim) return [];
    for (const el of elements) {
      const text = el.textContent?.trim() ?? "";
      if (text.startsWith(delim)) {
        flushCard();
        currentQuestion = text;
      } else if (currentQuestion) {
        currentContent += el.outerHTML + "\n";
      }
    }
  }

  flushCard();
  return cards;
}
