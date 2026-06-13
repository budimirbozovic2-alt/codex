// Factory helpers: hook-type detection + MnemonicCard creation.

import type { HookType, MnemonicCard, MnemonicSection } from "./types";
import { detectEnumerationItems } from "./content-utils";
import { htmlToDoc } from "@/lib/editor-v4/codecs/html-to-doc";
import type { EditorDoc } from "@/lib/editor-v4/types";
import { logger } from "@/lib/logger";

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

function sectionFromHtml(title: string, html: string): MnemonicSection {
  try {
    return { title, contentDoc: htmlToDoc(html || "") };
  } catch (err) {
    logger.error("[mnemonic:factory] htmlToDoc failed", err);
    return { title, contentDoc: EMPTY_DOC };
  }
}

function detectHookTypeFromHtml(html: string): HookType {
  const text = html.replace(/<[^>]*>/g, " ");
  const deadlinePattern =
    /\b(rok|dana|dan|mjesec|godin|Year|frist|deadline|\d+\s*(dana|dan|mjeseci|godina|sati|h))\b/i;
  if (deadlinePattern.test(text)) return "rokovi";
  const enumItems = detectEnumerationItems(html);
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
    sections: [sectionFromHtml("Isječak", selectedText)],
    categoryId,
    subcategoryId,
    tags: tags || [],
    hookType: detectHookTypeFromHtml(selectedText),
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
