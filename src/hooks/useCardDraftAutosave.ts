import { useEffect, useMemo, useRef, useCallback } from "react";
import type { SectionInput, CardType } from "./useCardActions";
import type { FrequencyTag, CardSourceType } from "@/lib/spaced-repetition";
import { draftRegistry } from "@/lib/drafts/draftRegistry";
import { putDraft, getDraft, deleteDraft } from "@/lib/drafts/draftsTable";
import { taskScheduler } from "@/lib/scheduler";
import { derivePlainText } from "@/lib/editor-v4/derived";
import { logger } from "@/lib/logger";

/**
 * Snapshot of in-progress card form state, persisted to the Dexie `drafts`
 * table so a tab close, refresh, or crash never destroys minutes of typing on
 * essay cards.
 *
 * PR6: migrated from LocalStorage → Dexie `drafts` table. Benefits:
 *   • Unified with `usePersistedDraftMirror` / `useDraftAutosave` storage.
 *   • Boot-recovery scanner (`draftRecovery.ts`) automatically sees these rows.
 *   • Quota survives much larger essays than LocalStorage's ~5 MB cap.
 *   • Debounce goes through `taskScheduler` — participates in app shutdown.
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
const DRAFT_SOURCE = "cardform";

export function buildDraftKey(editCardId: string | null | undefined, categoryId: string | null | undefined): string {
  if (editCardId) return `cardform:edit:${editCardId}`;
  return `cardform:new:${categoryId || "global"}`;
}

function isMeaningful(d: CardDraftSnapshot): boolean {
  const stripped = (s: string | undefined | null) =>
    typeof s === "string" ? s.replace(/<[^>]*>/g, "").trim() : "";
  if (stripped(d.question)) return true;
  if (d.cardType === "flash" && stripped(d.flashAnswer)) return true;
  if (d.cardType === "essay" && d.sections.some(s => {
    if (stripped(s.content)) return true;
    // PR-7b: contentDoc je SSOT; legacy `content` može biti undefined.
    const docText = s.contentDoc?.content?.content
      ? JSON.stringify(s.contentDoc.content).replace(/[^\p{L}\p{N}]/gu, "").trim()
      : "";
    return docText.length > 0;
  })) return true;
  return false;
}

export function useCardDraftAutosave(
  draftKey: string,
  draft: CardDraftSnapshot,
  enabled: boolean,
) {
  const latestRef = useRef<CardDraftSnapshot>(draft);
  const enabledRef = useRef<boolean>(enabled);
  const keyRef = useRef<string>(draftKey);
  latestRef.current = draft;
  enabledRef.current = enabled;
  keyRef.current = draftKey;

  const flush = useCallback(() => {
    if (!enabledRef.current) return;
    const d = latestRef.current;
    const key = keyRef.current;
    try {
      if (!isMeaningful(d)) {
        void deleteDraft(key);
        return;
      }
      const payload: StoredDraft = { ...d, savedAt: Date.now() };
      void putDraft({ key, source: DRAFT_SOURCE, payload, updatedAt: payload.savedAt });
    } catch (err) {
      if (import.meta.env.DEV) logger.warn("[useCardDraftAutosave] flush failed", err);
    }
  }, []);

  // Scheduler-owned debounce — flushes on shutdown and obeys `pauseWhenHidden: false`
  // so background saves never get starved.
  const debounced = useMemo(
    () => taskScheduler.debounce(flush, DEBOUNCE_MS, {
      label: `cardform-draft:${draftKey}`,
      pauseWhenHidden: false,
    }),
    [flush, draftKey],
  );

  // Trigger debounce on every meaningful draft change.
  useEffect(() => {
    if (!enabled) return;
    debounced();
    return () => {
      // Flush any pending write on cleanup (form close / key change).
      debounced.flush();
    };
  }, [draft, enabled, debounced]);

  // Force flush on tab hide / unload.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => { if (document.visibilityState === "hidden") debounced.flush(); };
    const onUnload = () => { debounced.flush(); };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [enabled, debounced]);

  // Mirror dirty state into the global registry so the central nav-guard sees it.
  useEffect(() => {
    if (!enabled) {
      draftRegistry.markClean(draftKey);
      return;
    }
    if (isMeaningful(draft)) draftRegistry.markDirty(draftKey);
    else draftRegistry.markClean(draftKey);
    return () => { draftRegistry.markClean(draftKey); };
  }, [draft, enabled, draftKey]);

  const clearDraft = useCallback(() => {
    debounced.cancel();
    void deleteDraft(draftKey);
    draftRegistry.markClean(draftKey);
  }, [debounced, draftKey]);

  return { clearDraft, flushDraft: flush };
}

/**
 * One-shot async loader called from form initialization. Returns a stored
 * draft if present, fresh enough, and meaningful. Does NOT auto-apply — caller
 * decides whether to surface a "restore draft?" banner.
 *
 * PR6: async because the Dexie `drafts` table read is async. Callers should
 * await inside a `useEffect` and `setState` on resolve.
 */
export async function loadCardDraft(draftKey: string): Promise<StoredDraft | null> {
  try {
    const row = await getDraft(draftKey);
    if (!row) return null;
    const parsed = row.payload as StoredDraft | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      await deleteDraft(draftKey);
      return null;
    }
    if (!isMeaningful(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
