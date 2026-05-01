import type { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/sources-storage";
import { stripHtml, sanitizeHtml } from "@/lib/sanitize";

export const WPM_OPTIONS = [100, 150, 200, 250, 300, 400, 500];
export const FONT_SIZES = [
  { label: "S", value: "text-base" },
  { label: "M", value: "text-lg" },
  { label: "L", value: "text-xl" },
  { label: "XL", value: "text-2xl" },
];

export type ContentSource = "cards" | "sources";
export type ReadMode = "subcategory" | "card" | "source";

export interface Segment {
  cardQuestion: string;
  sectionTitle: string;
  cardIndex: number;
  sectionIndex: number;
  words: string[];
  globalStartIdx: number;
}

export interface WordEntry {
  text: string;
  isTitle: boolean;
  segmentIdx: number;
}

export { stripHtml } from "@/lib/sanitize";

export function cleanForTTS(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}\s.,!?;:'"()-]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildSegments(selectedCards: Card[]): { segments: Segment[]; wordEntries: WordEntry[] } {
  const segments: Segment[] = [];
  const wordEntries: WordEntry[] = [];
  selectedCards.forEach((card, ci) => {
    card.sections.forEach((sec, si) => {
      const titleWords = (sec.title || "").split(/\s+/).filter(Boolean);
      const contentText = stripHtml(sec.content);
      const contentWords = contentText.split(/\s+/).filter(Boolean);
      if (titleWords.length === 0 && contentWords.length === 0) return;
      const segIdx = segments.length;
      const globalStart = wordEntries.length;
      titleWords.forEach(w => wordEntries.push({ text: w, isTitle: true, segmentIdx: segIdx }));
      contentWords.forEach(w => wordEntries.push({ text: w, isTitle: false, segmentIdx: segIdx }));
      segments.push({
        cardQuestion: card.question,
        sectionTitle: sec.title,
        cardIndex: ci,
        sectionIndex: si,
        words: [...titleWords, ...contentWords],
        globalStartIdx: globalStart,
      });
    });
  });
  return { segments, wordEntries };
}

export function buildSourceSegments(source: Source): { segments: Segment[]; wordEntries: WordEntry[] } {
  const segments: Segment[] = [];
  const wordEntries: WordEntry[] = [];
  const html = source.htmlContent || "";
  if (!html) return { segments, wordEntries };

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizeHtml(html), "text/html");
  const children = Array.from(doc.body.children);

  let currentTitle = source.title;
  let currentContent: string[] = [];

  const flush = () => {
    const text = currentContent.join(" ").trim();
    if (!text) return;
    const titleWords = currentTitle.split(/\s+/).filter(Boolean);
    const contentWords = text.split(/\s+/).filter(Boolean);
    if (titleWords.length === 0 && contentWords.length === 0) return;
    const segIdx = segments.length;
    const globalStart = wordEntries.length;
    titleWords.forEach(w => wordEntries.push({ text: w, isTitle: true, segmentIdx: segIdx }));
    contentWords.forEach(w => wordEntries.push({ text: w, isTitle: false, segmentIdx: segIdx }));
    segments.push({
      cardQuestion: source.title,
      sectionTitle: currentTitle,
      cardIndex: 0,
      sectionIndex: segIdx,
      words: [...titleWords, ...contentWords],
      globalStartIdx: globalStart,
    });
  };

  for (const el of children) {
    const tag = el.tagName;
    if (/^H[1-4]$/.test(tag)) {
      flush();
      currentTitle = el.textContent?.trim() || "Sekcija";
      currentContent = [];
    } else {
      const t = el.textContent?.trim();
      if (t) currentContent.push(t);
    }
  }
  flush();

  return { segments, wordEntries };
}

export function getActiveSegment(segments: Segment[], wordIdx: number): Segment | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (wordIdx >= segments[i].globalStartIdx) return segments[i];
  }
  return segments[0] || null;
}
