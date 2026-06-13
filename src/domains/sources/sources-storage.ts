/**
 * Sources SSOT façade — A1c-2.
 * Data plane delegates to queries/sources (SQLite-only).
 *
 * PR-H7 Hardening: Removed destructive listener drop
 * on HMR updates to prevent multi-module breaking.
 */
import type { Source } from "@/lib/db-types";
import { emitDomainChanged } from "@/lib/event-bus";
import {
  getSource as repoGetSource,
  listAllSources,
  listSourcesByCategory,
  putSource,
  deleteSourceAndUnlinkCards,
} from "@/lib/db/queries/sources";
import { logger } from "@/lib/logger";
import { 
  wrapWrite, 
  type WriteResult 
} from "@/lib/persistence/write-result";

export type { Source };

type ReviewConfirmListener = (cardId: string) => void;
const _reviewListeners = new Set<ReviewConfirmListener>();

export function onCardReviewConfirmed(
  fn: ReviewConfirmListener
): () => void {
  _reviewListeners.add(fn);
  return () => { 
    _reviewListeners.delete(fn); 
  };
}

export function confirmCardReview(cardId: string): void {
  for (const fn of _reviewListeners) {
    try { 
      fn(cardId); 
    } catch { /* swallow */ }
  }
}

type CardLinkClearedListener = (clearedCardIds: string[]) => void;
const _cardLinkListeners = new Set<CardLinkClearedListener>();

export function onCardLinksCleared(
  fn: CardLinkClearedListener
): () => void {
  _cardLinkListeners.add(fn);
  return () => { 
    _cardLinkListeners.delete(fn); 
  };
}

export function invalidateSourcesCache(): void {
  emitDomainChanged({ domain: "sources" });
}

export async function loadSources(): Promise<Source[]> {
  return listAllSources();
}

export async function loadSourcesByCategory(
  categoryId: string
): Promise<Source[]> {
  return listSourcesByCategory(categoryId);
}

export async function saveSource(
  source: Source
): Promise<WriteResult<void>> {
  const res = await wrapWrite(() => putSource(source));
  if (res.ok === true) {
    invalidateSourcesCache();
    return res;
  }
  logger.error("[sources-storage] saveSource failed", res.error);
  return res;
}

export async function deleteSource(id: string): Promise<void> {
  const clearedIds = await deleteSourceAndUnlinkCards(id);

  if (clearedIds.length > 0) {
    for (const fn of _cardLinkListeners) {
      try { 
        fn(clearedIds); 
      } catch { /* swallow */ }
    }
  }

  invalidateSourcesCache();
}

export async function getSource(
  id: string
): Promise<Source | undefined> {
  return repoGetSource(id);
}

export function extractOutline(
  html: string
): { id: string; text: string; level: number }[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const headings = doc.querySelectorAll("h1, h2, h3, h4");
  const outline: { id: string; text: string; level: number }[] = [];

  headings.forEach((h, i) => {
    const level = parseInt(h.tagName[1]);
    const id = `src-heading-${i}`;
    outline.push({ 
      id, 
      text: h.textContent?.trim() || `Heading ${i + 1}`, 
      level 
    });
  });

  return outline;
}

export function injectHeadingIds(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const headings = doc.querySelectorAll("h1, h2, h3, h4");

  headings.forEach((h, i) => {
    h.setAttribute("id", `src-heading-${i}`);
  });

  return doc.body.innerHTML;
}

export function createTextAnchor(text: string): string {
  return text
    .trim()
    .substring(0, 80)
    .toLowerCase()
    .replace(/\s+/g, " ");
}