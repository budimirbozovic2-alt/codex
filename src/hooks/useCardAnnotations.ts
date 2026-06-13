import { useCallback } from "react";
import {
  Card,
  calculateNextReview,
  computeAdaptiveModifiers,
  AdaptiveContext,
  clamp,
  RETENTION_MIN,
  RETENTION_MAX,
} from "@/lib/spaced-repetition";
import { loadAppSettings } from "@/lib/app-settings";
import { ReviewLogEntry } from "@/lib/storage";
import { reviewLogRepository } from "@/lib/repositories";
import { useCardMutations } from "@/hooks/card/useCardMutations";
import { getExaminerProfileSync } from "@/lib/examiner-profile-cache";
import { patchReviewLog } from "@/store/reviewSettingsStore";

import { logger } from "@/lib/logger";
interface UseCardAnnotationsParams {
  patchCard: (id: string, patcher: (card: Card) => Card) => void;
}

export function useCardAnnotations({
  patchCard,
}: UseCardAnnotationsParams) {
  const { bulkSetNeedsReview, bulkUpdateChapter } = useCardMutations();

  // O(1) review — surgical SQLite write (patchCard handles persist via Ref-Delta)
  const reviewSection = useCallback(
    (cardId: string, sectionId: string, grade: number) => {
      const cachedRetention = loadAppSettings().targetRetention;
      const entry: ReviewLogEntry = { timestamp: Date.now(), cardId, sectionId, grade, category: "" };

      patchCard(cardId, (c) => {
        // Fill in category now that we have the card
        entry.category = c.categoryId;

        let errorLog = c.errorLog;
        if (errorLog && errorLog.length > 0 && grade >= 3) {
          errorLog = errorLog.map((e) => ({
            ...e,
            recentSuccesses: (e.recentSuccesses || 0) + 1,
            successStreak: (e.successStreak || 0) + 1,
          }));
        } else if (errorLog && errorLog.length > 0 && grade === 1) {
          errorLog = errorLog.map((e) => ({ ...e, successStreak: 0 }));
        }

        const adaptiveCtx: AdaptiveContext = {
          frequencyTag: c.frequencyTag,
          sourceType: c.sourceType,
          examinerProfile: getExaminerProfileSync(c.categoryId),
        };

        // Capture reason codes for the review log (debug / explanation panel)
        const mods = computeAdaptiveModifiers(adaptiveCtx);
        if (mods.reasons.length > 0) {
          entry.reasons = mods.reasons.map(r => ({ code: r.code, label: r.label }));
        }
        entry.effectiveRetention = clamp(cachedRetention + mods.retentionBoost, RETENTION_MIN, RETENTION_MAX);
        entry.intervalMultiplier = mods.intervalMultiplier;

        return {
          ...c,
          ...(errorLog ? { errorLog } : {}),
          sections: c.sections.map((s) =>
            s.id !== sectionId ? s : { ...s, ...calculateNextReview(s, grade, cachedRetention, adaptiveCtx) },
          ),
        };
      });

      // Persist review log OUTSIDE the state updater to avoid nested setState.
      // Batched + debounced (250 ms) inside reviewLogRepository to avoid write floods.
      try { reviewLogRepository.append(entry); }
      catch (err) {
        logger.error("[reviewSection] log enqueue failed", err);
        void import("sonner").then(({ toast }) => toast.error("Memorija puna, istorija učenja se ne čuva!"));
      }
      // G1 fix: cap in-memory reviewLog to prevent unbounded growth.
      // The repository already persisted the entry — RAM-only patch here.
      patchReviewLog((log) => [...log, entry]);
    },
    [patchCard],
  );


  // O(1) markRead — surgical (patchCard handles persist)
  const markRead = useCallback(
    (id: string) => {
      patchCard(id, (c) => ({ ...c, readCount: (c.readCount || 0) + 1 }));
    },
    [patchCard],
  );

  // O(1) toggleTag — surgical (patchCard handles persist)
  const toggleTag = useCallback(
    (cardId: string, tag: string) => {
      patchCard(cardId, (c) => {
        const tags = c.tags || [];
        return { ...c, tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag] };
      });
    },
    [patchCard],
  );

  // O(1) logError — surgical, per-section penalty (patchCard handles persist)
  const logError = useCallback(
    (cardId: string, text: string, sectionId?: string) => {
      patchCard(cardId, (c) => {
        const errorLog = [...(c.errorLog || [])];
      const existingIdx = errorLog.findIndex((e) => e.text === text);
      if (existingIdx >= 0) {
        // C2 fix: clone the entry to avoid mutating the original object in cardMapRef
        errorLog[existingIdx] = {
          ...errorLog[existingIdx],
          count: errorLog[existingIdx].count + 1,
          lastMissed: new Date().toISOString(),
          successStreak: 0,
        };
      } else {
          errorLog.push({
            text,
            count: 1,
            recentSuccesses: 0,
            successStreak: 0,
            category: c.categoryId,
            lastMissed: new Date().toISOString(),
          });
        }
        // Only penalize the specific section if sectionId is provided
        const sections = c.sections.map((s) => {
          if (!sectionId || s.id !== sectionId) return s;
          return {
            ...s,
            difficulty: Math.min(10, s.difficulty + 0.5),
            stability: Math.max(0.1, s.stability * 0.85),
          };
        });
        return { ...c, errorLog, sections };
      });
    },
    [patchCard],
  );

  // O(1) clearErrorLog — surgical (patchCard handles persist)
  const clearErrorLog = useCallback(
    (cardId: string) => {
      patchCard(cardId, (c) => ({ ...c, errorLog: [] }));
    },
    [patchCard],
  );

  // O(1) toggleKeyPart — surgical (patchCard handles persist)
  const addKeyPart = useCallback(
    (cardId: string, text: string) => {
      patchCard(cardId, (c) => {
        const parts = c.keyParts || [];
        const normalized = text.trim();
        const existing = parts.findIndex((p) => p === normalized);
        if (existing >= 0) {
          return { ...c, keyParts: parts.filter((_, i) => i !== existing) };
        }
        return { ...c, keyParts: [...parts, normalized] };
      });
    },
    [patchCard],
  );

  // Bulk-flag — JSON-native write (no payload decode).
  const bulkFlagNeedsReview = useCallback(
    (cardIds: string[]) => {
      void bulkSetNeedsReview.mutateAsync(cardIds);
    },
    [bulkSetNeedsReview],
  );

  const bulkUpdateChapterHandler = useCallback(
    (updates: { id: string; chapterId: string | undefined; chapterOrder: number }[]) => {
      void bulkUpdateChapter.mutateAsync(
        updates.map((u) => ({
          id: u.id,
          chapterId: u.chapterId ?? "",
          chapterOrder: u.chapterOrder,
        })),
      );
    },
    [bulkUpdateChapter],
  );

  return {
    reviewSection,
    markRead,
    toggleTag,
    logError,
    clearErrorLog,
    addKeyPart,
    bulkFlagNeedsReview,
    bulkUpdateChapter: bulkUpdateChapterHandler,
  };
}
