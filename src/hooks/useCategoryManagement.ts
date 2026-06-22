import { useCallback } from "react";

import type { CategoryRecord, SubcategoryNode, ChapterNode, ExaminerProfile } from "@/lib/db-types";
import { newUuid } from "@/lib/ids";
import { invalidateSourcesCache } from "@/domains/sources/sources-storage";
import { categoryRepository } from "@/lib/repositories";
import { deleteCategoryWithDependencies } from "@/lib/services/categoryDeletionOrchestrator";
import { toast } from "sonner";
import {
  clearCardsSubcategoryRefs,
  clearCardsChapterRefs,
  reassignCardsSubcategory,
  notifyCardsChanged,
} from "@/lib/db/queries";
import { getCategoriesFromQueryCache } from "@/lib/query/categories-cache-coordinator";
import {
  runBulkCardsWrite,
  runBulkWriteSession,
} from "@/lib/query/all-caches-coordinator";
import { logger } from "@/lib/logger";

const getCategoryRecords = (): { id: string; name: string }[] =>
  getCategoriesFromQueryCache().map((r) => ({ id: r.id, name: r.name }));


function getNodes(rec: CategoryRecord): SubcategoryNode[] {
  return rec.subcategories ?? [];
}

export function useCategoryManagement() {
  const addCategory = useCallback(
    (name: string) => {
      const newId = newUuid();
      const newRec: CategoryRecord = { id: newId, name, sortOrder: 9999, subcategories: [] };
      void categoryRepository.commit(
        prev => prev.some(r => r.id === newId) ? prev : [...prev, newRec],
        "addCategory",
      );
    },
    [],
  );

  const renameCategory = useCallback(
    (categoryId: string, newName: string) => {
      void categoryRepository.commit(
        prev => prev.map(r => r.id === categoryId ? { ...r, name: newName } : r),
        "renameCategory",
      );
      notifyCardsChanged({ kind: "category", categoryId });
      invalidateSourcesCache();
    },
    [],
  );

  // Audit A2 / Phase 2b — deleteCategory no longer scans the RAM cardMap.
  // SQLite delete runs via `categoryRepository.deleteAsync`; cross-domain
  // cache cleanup is orchestrated by `deleteCategoryWithDependencies`.
  const deleteCategory = useCallback(
    (categoryId: string, purgeCards = false) => {
      const currentRecs = getCategoryRecords();
      const remaining = currentRecs.filter(r => r.id !== categoryId);
      const fallbackId = remaining.length > 0 ? remaining[0].id : "";

      void (async () => {
        try {
          await deleteCategoryWithDependencies(categoryId, { purgeCards, fallbackId });
        } catch (err) {
          logger.error("[deleteCategory] cascade failed", err);
          toast.error("Greška pri brisanju kategorije", { description: "Pokušajte ponovo." });
        }
      })();
    },
    [],
  );

  const addSubcategory = useCallback(
    (categoryId: string, subName: string) => {
      void categoryRepository.commit(
        prev => prev.map(r => {
          if (r.id !== categoryId) return r;
          const nodes = getNodes(r);
          if (nodes.some(n => n.name === subName)) return { ...r, subcategories: nodes };
          return { ...r, subcategories: [...nodes, { id: newUuid(), name: subName, chapters: [], sortOrder: nodes.length }] };
        }),
        "addSubcategory"
      );
    },
    [],
  );

  const renameSubcategory = useCallback(
    (categoryId: string, subcategoryId: string, newName: string) => {
      void categoryRepository.commit(
        prev => prev.map(r => {
          if (r.id !== categoryId) return r;
          const nodes = getNodes(r);
          return { ...r, subcategories: nodes.map(n => n.id === subcategoryId ? { ...n, name: newName } : n) };
        }),
        "renameSubcategory"
      );
      // Cards reference subcategoryId (stable) — no card update needed.
    },
    [],
  );

  // A2 collapse — one SQLite UPDATE (json_set/json_remove keeps payload in
  // sync with indexed columns). Replaces SELECT → mutate → cardMapBulkPut
  // round-trip. TanStack consumers refresh via notifyCardsChanged().
  const deleteSubcategory = useCallback(
    (categoryId: string, subcategoryId: string) => {
      void (async () => {
        try {
          await runBulkWriteSession(
            { cards: true, categories: true },
            async () => {
              const rows = await categoryRepository.commit(
                (prev) =>
                  prev.map((r) => {
                    if (r.id !== categoryId) return r;
                    const nodes = getNodes(r);
                    return {
                      ...r,
                      subcategories: nodes.filter((n) => n.id !== subcategoryId),
                    };
                  }),
                "deleteSubcategory",
                { skipNotify: true },
              );
              await clearCardsSubcategoryRefs(categoryId, subcategoryId);
              return rows;
            },
            (rows) => ({ freshCategories: rows }),
          );
        } catch (err) {
          logger.error("[deleteSubcategory] clear refs failed", err);
        }
      })();
    },
    [],
  );

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategoryId: string) => {
    if (ids.length === 0) return;
    void (async () => {
      try {
        await runBulkCardsWrite(async () => {
          await reassignCardsSubcategory(ids, subcategoryId);
        });
      } catch (err) {
        logger.error("[bulkUpdateSubcategory] failed", err);
      }
    })();
  }, []);

  const addChapter = useCallback((categoryId: string, subcategoryId: string, chapterName: string) => {
    void categoryRepository.commit(
      prev => prev.map(r => {
        if (r.id !== categoryId) return r;
        const nodes = getNodes(r);
        return {
          ...r,
          subcategories: nodes.map(n => {
            if (n.id !== subcategoryId) return n;
            const newChapter: ChapterNode = { id: newUuid(), name: chapterName, sortOrder: n.chapters.length };
            return { ...n, chapters: [...n.chapters, newChapter] };
          }),
        };
      }),
      "addChapter"
    );
  }, []);

  const renameChapter = useCallback((categoryId: string, subcategoryId: string, chapterId: string, newName: string) => {
    void categoryRepository.commit(
      prev => prev.map(r => {
        if (r.id !== categoryId) return r;
        const nodes = getNodes(r);
        return {
          ...r,
          subcategories: nodes.map(n => {
            if (n.id !== subcategoryId) return n;
            return { ...n, chapters: n.chapters.map(ch => ch.id === chapterId ? { ...ch, name: newName } : ch) };
          }),
        };
      }),
      "renameChapter"
    );
  }, []);

  // A2 collapse — single SQLite UPDATE keeps payload + columns in sync.
  const deleteChapter = useCallback((categoryId: string, subcategoryId: string, chapterId: string) => {
    void (async () => {
      try {
        await runBulkWriteSession(
          { cards: true, categories: true },
          async () => {
            const rows = await categoryRepository.commit(
              (prev) =>
                prev.map((r) => {
                  if (r.id !== categoryId) return r;
                  const nodes = getNodes(r);
                  return {
                    ...r,
                    subcategories: nodes.map((n) => {
                      if (n.id !== subcategoryId) return n;
                      return {
                        ...n,
                        chapters: n.chapters.filter((ch) => ch.id !== chapterId),
                      };
                    }),
                  };
                }),
              "deleteChapter",
              { skipNotify: true },
            );
            await clearCardsChapterRefs(categoryId, subcategoryId, chapterId);
            return rows;
          },
          (rows) => ({ freshCategories: rows }),
        );
      } catch (err) {
        logger.error("[deleteChapter] clear refs failed", err);
      }
    })();
  }, []);

  const reorderSubcategories = useCallback((categoryId: string, orderedIds: string[]) => {
    void categoryRepository.commit(
      prev => prev.map(r => {
        if (r.id !== categoryId) return r;
        const nodes = getNodes(r);
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const reordered = orderedIds.map((id, i) => {
          const n = nodeMap.get(id);
          return n ? { ...n, sortOrder: i } : { id, name: "Nepoznato", chapters: [], sortOrder: i };
        });
        return { ...r, subcategories: reordered };
      }),
      "reorderSubcategories"
    );
  }, []);

  const reorderChapters = useCallback((categoryId: string, subcategoryId: string, orderedIds: string[]) => {
    void categoryRepository.commit(
      prev => prev.map(r => {
        if (r.id !== categoryId) return r;
        const nodes = getNodes(r);
        return {
          ...r,
          subcategories: nodes.map(n => {
            if (n.id !== subcategoryId) return n;
            const chMap = new Map(n.chapters.map(ch => [ch.id, ch]));
            const reordered = orderedIds.map((id, i) => {
              const ch = chMap.get(id);
              return ch ? { ...ch, sortOrder: i } : { id, name: "Nepoznato", sortOrder: i };
            });
            return { ...n, chapters: reordered };
          }),
        };
      }),
      "reorderChapters"
    );
  }, []);

  const reorderCategories = useCallback((orderedIds: string[]) => {
    void categoryRepository.commit(
      prev => {
        const byId = new Map(prev.map(r => [r.id, r]));
        return orderedIds.map((id, i) => {
          const rec = byId.get(id);
          return rec ? { ...rec, sortOrder: i } : { id, name: "Kategorija", sortOrder: i, subcategories: [] };
        });
      },
      "reorderCategories"
    );
  }, []);

  const updateExaminerProfile = useCallback(
    (categoryId: string, profile: ExaminerProfile) => {
      void categoryRepository.commit(
        prev => prev.map(r =>
          r.id === categoryId
            ? { ...r, examinerProfile: { ...profile, updatedAt: Date.now() } }
            : r
        ),
        "updateExaminerProfile"
      );
    },
    [],
  );

  return {
    addCategory,
    renameCategory,
    deleteCategory,
    addSubcategory,
    renameSubcategory,
    deleteSubcategory,
    bulkUpdateSubcategory,
    addChapter,
    renameChapter,
    deleteChapter,
    reorderSubcategories,
    reorderChapters,
    reorderCategories,
    updateExaminerProfile,
  };
}
