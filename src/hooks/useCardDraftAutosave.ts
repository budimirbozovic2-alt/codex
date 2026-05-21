import { useEffect, useRef, useState, useCallback } from "react";
import type { SectionInput, CardType } from "./useCardActions";
import type { FrequencyTag, CardSourceType } from "@/lib/spaced-repetition";

import { logger } from "@/lib/logger";
/**
 * Snapshot of in-progress card form state, persisted to LocalStorage so a tab
 * close, refresh, or crash never destroys minutes of typing on essay cards.
 *
 * Keying strategy:
 *   - New card  → `cardform:new:${categoryId || "global"}` (one draft per category)
 *   - Edit card → `cardform:edit:${editCardId}`
 *
 * Drafts older than DRAFT_TTL_MS are silently ignored on load.
 */
export interface CardDraftSnapshot {
  cardType: CardType;
  question: string;
  flashAnswer: string;
  sections: SectionInput[];
  categoryId: string;
  subcategoryId: string;
  chapterId: string;
  frequencyTag: FrequencyTag | "";
  sourceType: CardSourceType | "";
}

interface StoredDraft extends CardDraftSnapshot {
  savedAt: number;
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEBOUNCE_MS = 600;

export function buildDraftKey(editCardId: string | null | undefined, categoryId: string | null | undefined): string {
  if (editCardId) return `cardform:edit:${editCardId}`;
  return `cardform:new:${categoryId || "global"}`;
}

function isMeaningful(d: CardDraftSnapshot): boolean {
  const stripped = (s: string) => s.replace(/<[^>]*>/g, "").trim();
  if (stripped(d.question)) return true;
  if (d.cardType === "flash" && stripped(d.flashAnswer)) return true;
  if (d.cardType === "essay" && d.sections.some(s => stripped(s.content))) return true;
  return false;
}

export function useCardDraftAutosave(
  draftKey: string,
  draft: CardDraftSnapshot,
  enabled: boolean,
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<CardDraftSnapshot>(draft);
  latestRef.current = draft;

  const flush = useCallback(() => {
    if (!enabled) return;
    try {
      const d = latestRef.current;
      if (!isMeaningful(d)) {
        localStorage.removeItem(draftKey);
        return;
      }
      const payload: StoredDraft = { ...d, savedAt: Date.now() };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch (err) {
      // Quota exceeded or storage unavailable — fail silently in autosave.
      if (import.meta.env.DEV) logger.warn("[useCardDraftAutosave] flush failed", err);
    }
  }, [draftKey, enabled]);

  // Debounced write on every change.
  // V8: cleanup MUST flush any pending debounce — otherwise toggling `enabled`
  // off (e.g. user closes the form within 600 ms of the last keystroke)
  // silently discards the in-flight write.
  useEffect(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        // Synchronous LS write — safe to invoke during cleanup.
        flush();
      }
    };
  }, [draft, enabled, flush]);

  // Force flush on tab hide / unload
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", flush);
    };
  }, [enabled, flush]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }, [draftKey]);

  return { clearDraft, flushDraft: flush };
}

/**
 * One-shot loader called from form initialization. Returns a stored draft if
 * present, fresh enough, and meaningful. Does NOT auto-apply — caller decides
 * whether to surface a "restore draft?" banner.
 */
export function loadCardDraft(draftKey: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKey);
      return null;
    }
    if (!isMeaningful(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
