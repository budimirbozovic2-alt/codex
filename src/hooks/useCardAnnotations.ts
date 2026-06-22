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

import { ReviewLogEntry } from "@/lib/storage";

import { useCardMutations } from "@/hooks/card/useCardMutations";

import { getExaminerProfileSync } from "@/lib/examiner-profile-cache";

import { resolveEffectiveSrParams } from "@/domains/subjects/subject-settings";

import {

  appendReviewLogOptimistic,

  getSrSettingsSnapshot,

} from "@/lib/query/review-settings-cache-coordinator";



import { logger } from "@/lib/logger";



export function useCardAnnotations() {

  const { bulkSetNeedsReview, bulkUpdateChapter, gradeSection } = useCardMutations();



  const patchCard = useCallback(

    (id: string, patcher: (card: Card) => Card) => {

      void gradeSection.mutateAsync({ cardId: id, patcher });

    },

    [gradeSection],

  );



  const reviewSection = useCallback(

    (cardId: string, sectionId: string, grade: number) => {

      const entry: ReviewLogEntry = {

        timestamp: Date.now(),

        cardId,

        sectionId,

        grade,

        category: "",

      };



      void gradeSection

        .mutateAsync({

          cardId,

          grade,

          reviewLogEntry: entry,

          patcher: (c) => {

            entry.category = c.categoryId;

            const { targetRetention } = resolveEffectiveSrParams(

              c.categoryId,

              getSrSettingsSnapshot(),

            );



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



            const mods = computeAdaptiveModifiers(adaptiveCtx);

            if (mods.reasons.length > 0) {

              entry.reasons = mods.reasons.map((r) => ({

                code: r.code,

                label: r.label,

              }));

            }

            entry.effectiveRetention = clamp(

              targetRetention + mods.retentionBoost,

              RETENTION_MIN,

              RETENTION_MAX,

            );

            entry.intervalMultiplier = mods.intervalMultiplier;



            return {

              ...c,

              ...(errorLog ? { errorLog } : {}),

              sections: c.sections.map((s) =>

                s.id !== sectionId

                  ? s

                  : {

                      ...s,

                      ...calculateNextReview(s, grade, targetRetention, adaptiveCtx),

                    },

              ),

            };

          },

        })

        .then(() => {

          appendReviewLogOptimistic(entry);

        })

        .catch((err) => {

          logger.error("[reviewSection] grade persist failed", err);

          void import("sonner").then(({ toast }) =>

            toast.error("Memorija puna, istorija učenja se ne čuva!"),

          );

        });

    },

    [gradeSection],

  );



  const markRead = useCallback(

    (id: string) => {

      patchCard(id, (c) => ({ ...c, readCount: (c.readCount || 0) + 1 }));

    },

    [patchCard],

  );



  const toggleTag = useCallback(

    (cardId: string, tag: string) => {

      patchCard(cardId, (c) => {

        const tags = c.tags || [];

        return {

          ...c,

          tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag],

        };

      });

    },

    [patchCard],

  );



  const logError = useCallback(

    (cardId: string, text: string, sectionId?: string) => {

      patchCard(cardId, (c) => {

        const errorLog = [...(c.errorLog || [])];

        const existingIdx = errorLog.findIndex((e) => e.text === text);

        if (existingIdx >= 0) {

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



  const clearErrorLog = useCallback(

    (cardId: string) => {

      patchCard(cardId, (c) => ({ ...c, errorLog: [] }));

    },

    [patchCard],

  );



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


