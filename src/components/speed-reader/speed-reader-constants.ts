import type { Card } from "@/lib/spaced-repetition";
import { derivePlainText } from "@/lib/editor-v4/derived";

export const WPM_OPTIONS = [100, 150, 200, 250, 300, 400, 500];
export const FONT_SIZES = [
  { label: "S", value: "text-base" },
  { label: "M", value: "text-lg" },
  { label: "L", value: "text-xl" },
  { label: "XL", value: "text-2xl" },
];

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
      const contentText = derivePlainText(sec.contentDoc);
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

export function getActiveSegment(segments: Segment[], wordIdx: number): Segment | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (wordIdx >= segments[i].globalStartIdx) return segments[i];
  }
  return segments[0] || null;
}
