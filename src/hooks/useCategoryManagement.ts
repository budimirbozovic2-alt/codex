import { useCallback, MutableRefObject } from "react";
import { Card } from "@/lib/spaced-repetition";
import { CardMap, bumpMapVersion, schedulePersist } from "@/lib/persist-queue";
import { db } from "@/lib/db";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { toast } from "@/hooks/use-toast";

interface UseCategoryManagementParams {
  setCategories: (updater: (prev: string[]) => string[]) => void;
  setSubcategories: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  cardMapRef: MutableRefObject<CardMap>;
  getCategoryRecords: () => { id: string; name: string }[];
}

export function useCategoryManagement({
  setCategories,
  setSubcategories,
  setCardMapState,
  cardMapRef,
  getCategoryRecords,
}: UseCategoryManagementParams) {
  const addCategory = useCallback(
    (name: string) => {
      // categories is UUID[] — addCategory creates a new CategoryRecord and adds its UUID
      const newId = crypto.randomUUID();
      (async () => {
        try {
          await db.categories.add({ id: newId, name, sortOrder: 9999, subcategories: [] });
        } catch (e) { console.error("[addCategory] IDB add failed", e); }
      })();
      setCategories((prev) => prev.includes(newId) ? prev : [...prev, newId]);
    },
    [setCategories],
  );

  // Pure UUID rename: only updates CategoryRecord.name, does NOT touch cards
  // Cards already point to the UUID which stays the same
  const renameCategory = useCallback(
    (categoryId: string, newName: string) => {
      // Update CategoryRecord name in IDB
      (async () => {
        try {
          const record = await db.categories.get(categoryId);
          if (record) {
            await db.categories.update(categoryId, { name: newName });
          }
          // Silent migration: fix any legacy cards that have name as categoryId
          const legacyCards = await db.cards.where("categoryId").equals(record?.name || "").toArray();
          if (legacyCards.length > 0) {
            const now = Date.now();
            const changed: Card[] = [];
            const nextRef = { ...cardMapRef.current };
            for (const c of legacyCards) {
              const u = { ...c, categoryId, updatedAt: now };
              nextRef[c.id] = u;
              changed.push(u);
            }
            if (changed.length > 0) {
              cardMapRef.current = nextRef;
              schedulePersist({ type: "bulk", cards: changed });
              setCardMapState(() => nextRef);
              bumpMapVersion();
            }
          }
          // Cascade rename to sources (by old name, for legacy)
          if (record?.name) {
            await db.sources.where("categoryId").equals(record.name).modify({ categoryId });
            invalidateSourcesCache();
          }
        } catch (err) {
          console.error("[renameCategory] failed", err);
          toast({ title: "Greška pri preimenovanju", description: "Pokušajte ponovo.", variant: "destructive" });
        }
      })();
    },
    [setCardMapState, cardMapRef],
  );

  const deleteCategory = useCallback(
    (categoryId: string, purgeCards = false) => {
      setCategories((prev) => prev.filter((c) => c !== categoryId));

      const records = getCategoryRecords();
      const remaining = records.filter(r => r.id !== categoryId);
      const fallbackId = remaining.length > 0 ? remaining[0].id : "";
      const now = Date.now();

      if (purgeCards) {
        const toDelete: string[] = [];
        const nextRef = { ...cardMapRef.current };
        for (const [id, c] of Object.entries(nextRef)) {
          if (c.categoryId === categoryId) {
            toDelete.push(id);
            delete nextRef[id];
          }
        }
        if (toDelete.length > 0) {
          cardMapRef.current = nextRef;
          setCardMapState(() => nextRef);
          bumpMapVersion();
          (async () => {
            try { await db.cards.bulkDelete(toDelete); } catch (err) {
              console.error("[deleteCategory] card purge failed", err);
            }
          })();
        }
      } else {
        const changed: Card[] = [];
        const nextRef = { ...cardMapRef.current };
        for (const [id, c] of Object.entries(nextRef)) {
          if (c.categoryId === categoryId) {
            const u = { ...c, categoryId: fallbackId, subcategory: "", updatedAt: now };
            nextRef[id] = u;
            changed.push(u);
          }
        }
        if (changed.length > 0) {
          cardMapRef.current = nextRef;
          schedulePersist({ type: "bulk", cards: changed });
          setCardMapState(() => nextRef);
          bumpMapVersion();
        }
      }

      setSubcategories((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });

      // Cascade to sources & delete IDB CategoryRecord
      (async () => {
        try {
          if (purgeCards) {
            await db.sources.where("categoryId").equals(categoryId).delete();
          } else {
            await db.sources.where("categoryId").equals(categoryId).modify({ categoryId: fallbackId });
          }
          await db.categories.delete(categoryId);
          invalidateSourcesCache();
        } catch (err) {
          console.error("[deleteCategory] cascade failed", err);
          toast({ title: "Greška pri brisanju kategorije", description: "Pokušajte ponovo.", variant: "destructive" });
        }
      })();
    },
    [setCategories, setCardMapState, setSubcategories, cardMapRef, getCategoryRecords],
  );

  // Subcategory operations — all keyed by categoryId (UUID)
  const addSubcategory = useCallback(
    (categoryId: string, subcategory: string) => {
      setSubcategories((prev) => {
        const list = prev[categoryId] || [];
        if (list.includes(subcategory)) return prev;
        return { ...prev, [categoryId]: [...list, subcategory] };
      });
    },
    [setSubcategories],
  );

  const renameSubcategory = useCallback(
    (categoryId: string, oldName: string, newName: string) => {
      setSubcategories((prev) => {
        const list = prev[categoryId] || [];
        if (list.includes(newName)) return prev;
        return { ...prev, [categoryId]: list.map((s) => (s === oldName ? newName : s)) };
      });
      const now = Date.now();
      const changed: Card[] = [];
      const nextRef = { ...cardMapRef.current };
      for (const [id, c] of Object.entries(nextRef)) {
        if (c.categoryId === categoryId && c.subcategory === oldName) {
          const u = { ...c, subcategory: newName, updatedAt: now };
          nextRef[id] = u;
          changed.push(u);
        }
      }
      if (changed.length > 0) {
        cardMapRef.current = nextRef;
        schedulePersist({ type: "bulk", cards: changed });
        setCardMapState(() => nextRef);
        bumpMapVersion();
      }
    },
    [setSubcategories, setCardMapState, cardMapRef],
  );

  const deleteSubcategory = useCallback(
    (categoryId: string, subcategory: string) => {
      setSubcategories((prev) => ({ ...prev, [categoryId]: (prev[categoryId] || []).filter((s) => s !== subcategory) }));
      const now = Date.now();
      const changed: Card[] = [];
      const nextRef = { ...cardMapRef.current };
      for (const [id, c] of Object.entries(nextRef)) {
        if (c.categoryId === categoryId && c.subcategory === subcategory) {
          const u = { ...c, subcategory: "", updatedAt: now };
          nextRef[id] = u;
          changed.push(u);
        }
      }
      if (changed.length > 0) {
        cardMapRef.current = nextRef;
        schedulePersist({ type: "bulk", cards: changed });
        setCardMapState(() => nextRef);
        bumpMapVersion();
      }
    },
    [setSubcategories, setCardMapState, cardMapRef],
  );

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategory: string) => {
    const now = Date.now();
    const changed: Card[] = [];
    const nextRef = { ...cardMapRef.current };
    for (const id of ids) {
      if (nextRef[id]) {
        const u = { ...nextRef[id], subcategory, updatedAt: now };
        nextRef[id] = u;
        changed.push(u);
      }
    }
    if (changed.length > 0) {
      cardMapRef.current = nextRef;
      schedulePersist({ type: "bulk", cards: changed });
      setCardMapState(() => nextRef);
      bumpMapVersion();
    }
  }, [setCardMapState, cardMapRef]);

  return {
    addCategory,
    renameCategory,
    deleteCategory,
    addSubcategory,
    renameSubcategory,
    deleteSubcategory,
    bulkUpdateSubcategory,
  };
}
