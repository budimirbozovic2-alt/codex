import { useCallback } from "react";
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

  // O(1) review — surgical IDB write
  const reviewSection = useCallback(
    (cardId: string, sectionId: string, grade: number) => {
      const cachedRetention = loadAppSettings().targetRetention;
      const entry: ReviewLogEntry = { timestamp: Date.now(), cardId, sectionId, grade, category: "" };

      patchCard(cardId, (c) => {
        // Fill in category now that we have the card
        entry.category = c.category;

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

      // Persist review log OUTSIDE the state updater to avoid nested setState
      (async () => {
        try { await idbAddReviewLogEntry(entry); }
        catch (err) {
          console.error("[reviewSection] log write failed", err);
          const { toast } = await import("sonner");
          toast.error("Memorija puna, istorija učenja se ne čuva!");
        }
      })();
      setReviewLog((log) => [...log, entry]);
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

  // O(1) logError — surgical, per-section penalty (H5 fix)
  const logError = useCallback(
    (cardId: string, text: string, sectionId?: string) => {
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
        // Only penalize the specific section if sectionId is provided
        const sections = c.sections.map((s) => {
          if (sectionId && s.id !== sectionId) return s;
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
    let updated: Card[] = [];
    setCardMapState((prev) => {
      const next = { ...prev };
      for (const id of cardIds) {
        if (next[id]) {
          next[id] = { ...next[id], needsReview: true };
          updated.push(next[id]);
        }
      }
      return next;
    });
    if (updated.length > 0) schedulePersist({ type: "bulk", cards: updated });
  }, [setCardMapState]);

  // Reorder cards by setting sortOrder
  const reorderCards = useCallback((orderedIds: string[]) => {
    let updated: Card[] = [];
    setCardMapState((prev) => {
      const next = { ...prev };
      orderedIds.forEach((id, index) => {
        if (next[id]) {
          next[id] = { ...next[id], sortOrder: index };
          updated.push(next[id]);
        }
      });
      return next;
    });
    if (updated.length > 0) schedulePersist({ type: "bulk", cards: updated });
  }, [setCardMapState]);

  // Update chapter and chapterOrder (Mental Skeleton DnD)
  const bulkUpdateChapter = useCallback((updates: { id: string; chapter: string; chapterOrder: number }[]) => {
    let changed: Card[] = [];
    setCardMapState((prev) => {
      const next = { ...prev };
      for (const u of updates) {
        if (next[u.id]) {
          next[u.id] = { ...next[u.id], chapter: u.chapter, chapterOrder: u.chapterOrder };
          changed.push(next[u.id]);
        }
      }
      return next;
    });
    if (changed.length > 0) schedulePersist({ type: "bulk", cards: changed });
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
