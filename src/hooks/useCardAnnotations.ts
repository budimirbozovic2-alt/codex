import { useCallback, useRef } from "react";
import { Card, calculateNextReview } from "@/lib/spaced-repetition";
import { loadAppSettings } from "@/lib/app-settings";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, PersistAction, schedulePersist } from "@/lib/persist-queue";
import { idbAddReviewLogEntry } from "@/lib/db";

interface UseCardAnnotationsParams {
  patchCard: (id: string, patcher: (card: Card) => Card) => void;
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  setReviewLog: (updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => void;
}

export function useCardAnnotations({
  patchCard,
  setCardMapState,
  setReviewLog,
}: UseCardAnnotationsParams) {
  const cachedRetentionRef = useRef(loadAppSettings().targetRetention);

  // O(1) review — surgical IDB write
  const reviewSection = useCallback(
    (cardId: string, sectionId: string, grade: number) => {
      const cachedRetention = cachedRetentionRef.current;
      patchCard(cardId, (c) => {
        const entry: ReviewLogEntry = { timestamp: Date.now(), cardId, sectionId, grade, category: c.category };
        idbAddReviewLogEntry(entry);
        setReviewLog((log) => [...log, entry]);

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

        return {
          ...c,
          ...(errorLog ? { errorLog } : {}),
          sections: c.sections.map((s) =>
            s.id !== sectionId ? s : { ...s, ...calculateNextReview(s, grade, cachedRetention) },
          ),
        };
      });
    },
    [patchCard, setReviewLog],
  );

  // O(1) markRead — surgical
  const markRead = useCallback(
    (id: string) => {
      patchCard(id, (c) => ({ ...c, readCount: (c.readCount || 0) + 1 }));
    },
    [patchCard],
  );

  // O(1) toggleTag — surgical
  const toggleTag = useCallback(
    (cardId: string, tag: string) => {
      patchCard(cardId, (c) => {
        const tags = c.tags || [];
        return { ...c, tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag] };
      });
    },
    [patchCard],
  );

  // O(1) logError — surgical
  const logError = useCallback(
    (cardId: string, text: string) => {
      patchCard(cardId, (c) => {
        const errorLog = [...(c.errorLog || [])];
        const existing = errorLog.find((e) => e.text === text);
        if (existing) {
          existing.count += 1;
          existing.lastMissed = new Date().toISOString();
          existing.successStreak = 0;
        } else {
          errorLog.push({
            text,
            count: 1,
            recentSuccesses: 0,
            successStreak: 0,
            category: c.category,
            lastMissed: new Date().toISOString(),
          });
        }
        const sections = c.sections.map((s) => ({
          ...s,
          difficulty: Math.min(10, s.difficulty + 0.5),
          stability: Math.max(0.1, s.stability * 0.85),
        }));
        return { ...c, errorLog, sections };
      });
    },
    [patchCard],
  );

  // O(1) clearErrorLog — surgical
  const clearErrorLog = useCallback(
    (cardId: string) => {
      patchCard(cardId, (c) => ({ ...c, errorLog: [] }));
    },
    [patchCard],
  );

  // O(1) toggleKeyPart — surgical
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

  // Bulk flag cards as needsReview
  const bulkFlagNeedsReview = useCallback((cardIds: string[]) => {
    if (cardIds.length === 0) return;
    setCardMapState((prev) => {
      const next = { ...prev };
      const updated: Card[] = [];
      for (const id of cardIds) {
        if (next[id]) {
          next[id] = { ...next[id], needsReview: true };
          updated.push(next[id]);
        }
      }
      schedulePersist({ type: "bulk", cards: updated });
      return next;
    });
  }, [setCardMapState]);

  // Reorder cards by setting sortOrder
  const reorderCards = useCallback((orderedIds: string[]) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      const updated: Card[] = [];
      orderedIds.forEach((id, index) => {
        if (next[id]) {
          next[id] = { ...next[id], sortOrder: index };
          updated.push(next[id]);
        }
      });
      schedulePersist({ type: "bulk", cards: updated });
      return next;
    });
  }, [setCardMapState]);

  // Update chapter and chapterOrder (Mental Skeleton DnD)
  const bulkUpdateChapter = useCallback((updates: { id: string; chapter: string; chapterOrder: number }[]) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      const changed: Card[] = [];
      for (const u of updates) {
        if (next[u.id]) {
          next[u.id] = { ...next[u.id], chapter: u.chapter, chapterOrder: u.chapterOrder };
          changed.push(next[u.id]);
        }
      }
      schedulePersist({ type: "bulk", cards: changed });
      return next;
    });
  }, [setCardMapState]);

  return {
    reviewSection,
    markRead,
    toggleTag,
    logError,
    clearErrorLog,
    addKeyPart,
    bulkFlagNeedsReview,
    reorderCards,
    bulkUpdateChapter,
  };
}
