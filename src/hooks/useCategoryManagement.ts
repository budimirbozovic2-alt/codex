import { useCallback } from "react";
import { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord, SubcategoryNode, ChapterNode, ExaminerProfile } from "@/lib/db-types";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { cascadeDeleteCategoryDomains } from "@/lib/category-deletion-service";
import { toast } from "sonner";
import { optimisticCategoryUpdate } from "@/lib/category-service";
import { stableLegacyId } from "@/lib/stable-id";
import { bulkPut as cardMapBulkPut } from "@/lib/cards/cardMapWrites";
import { cardsBySubcategory, cardsByChapter, getCardsByIds } from "@/lib/db/queries";
import { getCategoryStoreRecords } from "@/store";

import { logger } from "@/lib/logger";

import { setCategoryStoreRecords } from "@/store";


// Stable module-level setter — proxies into the categoryStore mirror.
const setCategoryRecords: React.Dispatch<React.SetStateAction<CategoryRecord[]>> = (action) => {
  const prev = getCategoryStoreRecords();
  const next = typeof action === "function"
    ? (action as (p: CategoryRecord[]) => CategoryRecord[])(prev)
    : action;
  if (next === prev) return;
  setCategoryStoreRecords(next);
};

const getCategoryRecords = (): { id: string; name: string }[] => getCategoryStoreRecords();


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

export function useCategoryManagement() {

  
  
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
  const deleteCategory = useCallback(
    (categoryId: string, purgeCards = false) => {
      // I1 fix: pre-compute fallbackId BEFORE optimistic update to avoid async race.
      const currentRecs = getCategoryRecords();
      const remaining = currentRecs.filter(r => r.id !== categoryId);
      const fallbackId = remaining.length > 0 ? remaining[0].id : "";

      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.filter(r => r.id !== categoryId),
        "deleteCategory"
      );

      // Audit A2 / Phase 2b — NO JS scan over the RAM cardMap. The atomic
      // SQL transaction in `categoryRepository.deleteAsync` handles cards +
      // sources re-parent/purge in a single ACID step, and FK CASCADE wipes
      // mindMaps / mnemonics / knowledgeBaseArticles. TanStack consumers are
      // refreshed via `notifyCardsChanged()` inside `cascadeDeleteCategoryDomains`.
      (async () => {
        try {
          await cascadeDeleteCategoryDomains(categoryId, { purgeCards, fallbackId });
          invalidateSourcesCache();
        } catch (err) {
          logger.error("[deleteCategory] cascade failed", err);
          toast.error("Greška pri brisanju kategorije", { description: "Pokušajte ponovo." });
        }
      })();
    },
    [setCategoryRecords, getCategoryRecords],
  );


  const addSubcategory = useCallback(
    (categoryId: string, subName: string) => {
      optimisticCategoryUpdate(
        setCategoryRecords,
        prev => prev.map(r => {
          if (r.id !== categoryId) return r;
          const nodes = getNodes(r);
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

      // Phase 2b — source from SQLite (RAM map is no longer hydrated at boot).
      // FK CASCADE doesn't apply (subcategories live inside categories.payload JSON,
      // not as a separate table), so we clear sub/chapter refs explicitly.
      void (async () => {
        try {
          const rows = await cardsBySubcategory(categoryId, subcategoryId);
          if (rows.length === 0) return;
          const now = Date.now();
          const changed: Card[] = rows.map(c => ({
            ...c, subcategoryId: undefined, chapterId: undefined, updatedAt: now,
          }));
          cardMapBulkPut(changed); // persists via persistQueue + notifyCardsChanged
        } catch (err) {
          logger.error("[deleteSubcategory] clear refs failed", err);
        }
      })();
    },
    [setCategoryRecords],
  );

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategoryId: string) => {
    if (ids.length === 0) return;
    // Phase 2b — fetch via SQLite, mutate, bulkPut. RAM map may be cold.
    void (async () => {
      try {
        const rows = await getCardsByIds(ids);
        const now = Date.now();
        const changed: Card[] = [];
        for (const r of rows) if (r) changed.push({ ...r, subcategoryId, updatedAt: now });
        if (changed.length > 0) cardMapBulkPut(changed);
      } catch (err) {
        logger.error("[bulkUpdateSubcategory] failed", err);
      }
    })();
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
  const deleteChapter = useCallback((categoryId: string, subcategoryId: string, chapterId: string) => {
    // Phase 2b — fetch affected cards from SQLite, clear chapterId, bulkPut.
    void (async () => {
      try {
        const rows = await cardsByChapter(categoryId, chapterId);
        // cardsByChapter is keyed on (categoryId, chapterId); we double-filter
        // on subcategoryId for safety (matches legacy semantics).
        const affected = rows.filter(c => c.subcategoryId === subcategoryId);
        if (affected.length > 0) {
          const now = Date.now();
          const changed: Card[] = affected.map(c => ({ ...c, chapterId: undefined, updatedAt: now }));
          cardMapBulkPut(changed);
        }
      } catch (err) {
        logger.error("[deleteChapter] clear refs failed", err);
      }
    })();

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
  }, [setCategoryRecords]);

          subcategories: nodes.map(n => {
            if (n.id !== subcategoryId) return n;
            return { ...n, chapters: n.chapters.filter(ch => ch.id !== chapterId) };
          }),
        };
      }),
      "deleteChapter"
    );
  }, [setCategoryRecords]);

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
