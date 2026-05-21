import { useCallback, MutableRefObject } from "react";
import { Card } from "@/lib/spaced-repetition";
import { CardMap } from "@/lib/persist-queue";
import { db, idbDeleteCard, type CategoryRecord, type SubcategoryNode, type ChapterNode, type ExaminerProfile } from "@/lib/db";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { cascadeDeleteCategoryDomains } from "@/lib/category-deletion-service";
import { toast } from "sonner";
import { optimisticCategoryUpdate } from "@/lib/category-service";
import { stableLegacyId } from "@/lib/stable-id";
import { cardRepository } from "@/lib/repositories/cardRepository";

import { logger } from "@/lib/logger";
interface UseCategoryManagementParams {
  setCategoryRecords: React.Dispatch<React.SetStateAction<CategoryRecord[]>>;
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  cardMapRef: MutableRefObject<CardMap>;
  getCategoryRecords: () => { id: string; name: string }[];
}

// ─── Helper: osigurava da čvorovi imaju UUID sistemsku strukturu ───
// Legacy string nodes get a *deterministic* id (stableLegacyId) so re-running
// normalization on the same record never mints a fresh UUID. This keeps
// references from cards stable and prevents action-path id drift.
function normalizeNode(s: unknown, i: number, parentScope: string): SubcategoryNode {
  if (typeof s === "string") {
    return { id: stableLegacyId(parentScope, s), name: s, chapters: [], sortOrder: i };
  }
  const obj = s as Partial<SubcategoryNode> & { name: string };
  const subId = obj.id || stableLegacyId(parentScope, obj.name);
  return {
    id: subId,
    name: obj.name,
    chapters: ((obj.chapters || []) as unknown[]).map((ch, ci): ChapterNode => {
      if (typeof ch === "string") {
        return { id: stableLegacyId(subId, ch), name: ch, sortOrder: ci };
      }
      const c = ch as Partial<ChapterNode> & { name: string };
      return { id: c.id || stableLegacyId(subId, c.name), name: c.name, sortOrder: c.sortOrder ?? ci };
    }),
    sortOrder: obj.sortOrder ?? i,
  };
}

function getNodes(rec: CategoryRecord): SubcategoryNode[] {
  return ((rec.subcategories || []) as unknown[]).map((s, i) => normalizeNode(s, i, rec.id));
}

export function useCategoryManagement({
  setCategoryRecords,
  setCardMapState: _legacySetCardMap, // Phase 3b: kept for back-compat, unused
  cardMapRef,
  getCategoryRecords,
}: UseCategoryManagementParams) {
  void _legacySetCardMap;
  
  
  const addCategory = useCallback(
    (name: string) => {
      const newId = crypto.randomUUID();
      const newRec: CategoryRecord = { id: newId, name, sortOrder: 9999, subcategories: [] };
      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.some(r => r.id === newId) ? prev : [...prev, newRec],
        "addCategory"
      );
    },
    [setCategoryRecords],
  );

  const renameCategory = useCallback(
    (categoryId: string, newName: string) => {
      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.map(r => r.id === categoryId ? { ...r, name: newName } : r),
        "renameCategory"
      );
      invalidateSourcesCache();
    },
    [setCategoryRecords],
  );

  const deleteCategory = useCallback(
    (categoryId: string, purgeCards = false) => {
      // I1 fix: pre-compute fallbackId BEFORE optimistic update to avoid async race
      const currentRecs = getCategoryRecords();
      const remaining = currentRecs.filter(r => r.id !== categoryId);
      const fallbackId = remaining.length > 0 ? remaining[0].id : "";

      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.filter(r => r.id !== categoryId),
        "deleteCategory"
      );
      const now = Date.now();

      // fallbackId already computed above

      if (purgeCards) {
        // Phase 3b: collect ids only and route through repository.applySyncDelta
        // which performs the RAM delete + CARDS_UPDATED emit. IDB rows are
        // dropped atomically inside cascadeDeleteCategoryDomains below.
        const toDelete: string[] = [];
        const ref = cardMapRef.current;
        for (const [id, c] of Object.entries(ref)) {
          if (c.categoryId === categoryId) toDelete.push(id);
        }
        if (toDelete.length > 0) cardRepository.applySyncDelta([], toDelete);
      } else {
        // Phase 3b: build per-card updates and apply RAM-only through
        // applySyncDelta. IDB persistence is owned by the cascade tx.
        const changed: Card[] = [];
        const ref = cardMapRef.current;
        for (const [id, c] of Object.entries(ref)) {
          if (c.categoryId === categoryId) {
            changed.push({ ...c, categoryId: fallbackId, subcategoryId: undefined, chapterId: undefined, updatedAt: now });
          }
        }
        if (changed.length > 0) cardRepository.applySyncDelta(changed, []);
      }

      (async () => {
        try {
          // A1+F1: atomic cascade across all category-keyed side-stores
          // (knowledgeBaseArticles, mindMaps, mnemonics, settings, planner refs,
          // AND cards/sources).
          await cascadeDeleteCategoryDomains(categoryId, { purgeCards, fallbackId });

          invalidateSourcesCache();
        } catch (err) {
          logger.error("[deleteCategory] cascade failed", err);
          toast.error("Greška pri brisanju kategorije", { description: "Pokušajte ponovo." });
        }
      })();
    },
    [setCategoryRecords, cardMapRef, getCategoryRecords],
  );

  const addSubcategory = useCallback(
    (categoryId: string, subName: string) => {
      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.map(r => {
          if (r.id !== categoryId) return r;
          const nodes = getNodes(r);
          if (nodes.some(n => n.name === subName)) return { ...r, subcategories: nodes };
          return { ...r, subcategories: [...nodes, { id: crypto.randomUUID(), name: subName, chapters: [], sortOrder: nodes.length }] };
        }),
        "addSubcategory"
      );
    },
    [setCategoryRecords],
  );

  const renameSubcategory = useCallback(
    (categoryId: string, subcategoryId: string, newName: string) => {
      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.map(r => {
          if (r.id !== categoryId) return r;
          const nodes = getNodes(r);
          return { ...r, subcategories: nodes.map(n => n.id === subcategoryId ? { ...n, name: newName } : n) };
        }),
        "renameSubcategory"
      );
      // Nema potrebe za ažuriranjem kartica jer referenciraju subcategoryId koji se NE mijenja
    },
    [setCategoryRecords],
  );

  const deleteSubcategory = useCallback(
    (categoryId: string, subcategoryId: string) => {
      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.map(r => {
          if (r.id !== categoryId) return r;
          const nodes = getNodes(r);
          return { ...r, subcategories: nodes.filter(n => n.id !== subcategoryId) };
        }),
        "deleteSubcategory"
      );
      
      // Phase 3b — repository.bulkPut handles persist + RAM + emit.
      const now = Date.now();
      const ref = cardMapRef.current;
      const changed: Card[] = [];
      for (const [id, c] of Object.entries(ref)) {
        if (c.categoryId === categoryId && c.subcategoryId === subcategoryId) {
          changed.push({ ...c, subcategoryId: undefined, chapterId: undefined, updatedAt: now });
          void id;
        }
      }
      if (changed.length > 0) cardRepository.bulkPut(changed);
    },
    [setCategoryRecords, cardMapRef],
  );

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategoryId: string) => {
    // Phase 3b — bulkPatch resolves ids → patches → bulkPut atomically.
    if (ids.length === 0) return;
    cardRepository.bulkPatch(ids, (c) => ({ ...c, subcategoryId }));
  }, []);

  const addChapter = useCallback((categoryId: string, subcategoryId: string, chapterName: string) => {
    optimisticCategoryUpdate(
      setCategoryRecords,
      prev => prev.map(r => {
        if (r.id !== categoryId) return r;
        const nodes = getNodes(r);
        return {
          ...r,
          subcategories: nodes.map(n => {
            if (n.id !== subcategoryId) return n;
            const newChapter: ChapterNode = { id: crypto.randomUUID(), name: chapterName, sortOrder: n.chapters.length };
            return { ...n, chapters: [...n.chapters, newChapter] };
          }),
        };
      }),
      "addChapter"
    );
  }, [setCategoryRecords]);

  const renameChapter = useCallback((categoryId: string, subcategoryId: string, chapterId: string, newName: string) => {
    optimisticCategoryUpdate(
      setCategoryRecords,
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
  }, [setCategoryRecords]);

  const deleteChapter = useCallback((categoryId: string, subcategoryId: string, chapterId: string) => {
    // Phase 3b — repository.bulkPut handles persist + RAM + emit.
    const now = Date.now();
    const ref = cardMapRef.current;
    const changed: Card[] = [];
    for (const [id, c] of Object.entries(ref)) {
      if (c.categoryId === categoryId && c.subcategoryId === subcategoryId && c.chapterId === chapterId) {
        changed.push({ ...c, chapterId: undefined, updatedAt: now });
        void id;
      }
    }
    if (changed.length > 0) cardRepository.bulkPut(changed);

    optimisticCategoryUpdate(
      setCategoryRecords,
      prev => prev.map(r => {
        if (r.id !== categoryId) return r;
        const nodes = getNodes(r);
        return {
          ...r,
          subcategories: nodes.map(n => {
            if (n.id !== subcategoryId) return n;
            return { ...n, chapters: n.chapters.filter(ch => ch.id !== chapterId) };
          }),
        };
      }),
      "deleteChapter"
    );
  }, [setCategoryRecords, cardMapRef]);

  const reorderSubcategories = useCallback((categoryId: string, orderedIds: string[]) => {
    optimisticCategoryUpdate(
      setCategoryRecords,
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
  }, [setCategoryRecords]);

  const reorderChapters = useCallback((categoryId: string, subcategoryId: string, orderedIds: string[]) => {
    optimisticCategoryUpdate(
      setCategoryRecords,
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
  }, [setCategoryRecords]);

  const reorderCategories = useCallback((orderedIds: string[]) => {
    optimisticCategoryUpdate(
      setCategoryRecords,
      prev => {
        const byId = new Map(prev.map(r => [r.id, r]));
        return orderedIds.map((id, i) => {
          const rec = byId.get(id);
          return rec ? { ...rec, sortOrder: i } : { id, name: "Kategorija", sortOrder: i, subcategories: [] };
        });
      },
      "reorderCategories"
    );
  }, [setCategoryRecords]);

  const updateExaminerProfile = useCallback(
    (categoryId: string, profile: ExaminerProfile) => {
      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.map(r =>
          r.id === categoryId
            ? { ...r, examinerProfile: { ...profile, updatedAt: Date.now() } }
            : r
        ),
        "updateExaminerProfile"
      );
    },
    [setCategoryRecords],
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
