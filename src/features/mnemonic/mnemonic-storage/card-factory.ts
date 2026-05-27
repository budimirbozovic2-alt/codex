// Factory helpers: hook-type detection + MnemonicCard creation.

import type { HookType, MnemonicCard } from "./types";
import { detectEnumerationItems } from "./content-utils";

// Auto-detect hook type from content
export function detectHookType(sections: { content: string }[]): HookType {
  const allContent = sections.map(s => s.content).join(" ");
  const text = allContent.replace(/<[^>]*>/g, " ");
  // Check for deadlines/numbers patterns (rok, dan, mjesec, godina + numbers)
  const deadlinePattern = /\b(rok|dana|dan|mjesec|godin|Year|frist|deadline|\d+\s*(dana|dan|mjeseci|godina|sati|h))\b/i;
  if (deadlinePattern.test(text)) return "rokovi";
  // Check for enumerations
  const enumItems = detectEnumerationItems(allContent);
  if (enumItems.length >= 2) return "nabrajanja";
  return "ostalo";
}

export function createMnemonicCardFromSelection(
  originalCardId: string,
  question: string,
  selectedText: string,
  categoryId: string,
  subcategoryId?: string,
  tags?: string[],
): MnemonicCard {
  return {
    id: crypto.randomUUID(),
    originalCardId,
    question,
    sections: [{ title: "Isječak", content: selectedText }],
    categoryId,
    subcategoryId,
    tags: tags || [],
    hookType: detectHookType([{ content: selectedText }]),
    hookMode: "video",
    mnemonicVideo: "",
    acronym: "",
    mnemonicStatus: "new",
    createdAt: Date.now(),
    testCount: 0,
    successCount: 0,
    failCount: 0,
    lastTested: null,
  };
}

export function createMnemonicCard(
  originalCardId: string,
  question: string,
  sections: { title: string; content: string }[],
  categoryId: string,
  subcategoryId?: string,
  tags?: string[],
): MnemonicCard {
  return {
    id: crypto.randomUUID(),
    originalCardId,
    question,
    sections,
    categoryId,
    subcategoryId,
    tags: tags || [],
    hookType: detectHookType(sections),
    hookMode: "video",
    mnemonicVideo: "",
    acronym: "",
    mnemonicStatus: "new",
    createdAt: Date.now(),
    testCount: 0,
    successCount: 0,
    failCount: 0,
    lastTested: null,
  };
}
