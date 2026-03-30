import { useCallback, MutableRefObject } from "react";
import { Card } from "@/lib/spaced-repetition";
import { CardMap, bumpMapVersion, schedulePersist } from "@/lib/persist-queue";
import { db, type SubcategoryNode } from "@/lib/db";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { toast } from "@/hooks/use-toast";

interface UseCategoryManagementParams {
  setCategories: (updater: (prev: string[]) => string[]) => void;
  setSubcategories: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  cardMapRef: MutableRefObject<CardMap>;
  getCategoryRecords: () => { id: string; name: string }[];
}

// ─── Helper: read SubcategoryNode[] from IDB for a category ───
async function getNodes(catId: string): Promise<SubcategoryNode[]> {
  const rec = await db.categories.get(catId);
  if (!rec) return [];
  return (rec.subcategories || []).map((s: any) =>
    typeof s === "string" ? { name: s, chapters: [], sortOrder: 0 } : s
  );
}

async function saveNodes(catId: string, nodes: SubcategoryNode[]): Promise<void> {
  await db.categories.update(catId, { subcategories: nodes });
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

  const renameCategory = useCallback(
    (categoryId: string, newName: string) => {
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

  // ═══════════════════════════════════════════════════════
  // Subcategory CRUD — persists SubcategoryNode[] to IDB
  // ═══════════════════════════════════════════════════════

  const addSubcategory = useCallback(
    (categoryId: string, subcategory: string) => {
      setSubcategories((prev) => {
        const list = prev[categoryId] || [];
        if (list.includes(subcategory)) return prev;
        return { ...prev, [categoryId]: [...list, subcategory] };
      });
      (async () => {
        try {
          const nodes = await getNodes(categoryId);
          if (nodes.some(n => n.name === subcategory)) return;
          nodes.push({ name: subcategory, chapters: [], sortOrder: nodes.length });
          await saveNodes(categoryId, nodes);
        } catch (e) { console.error("[addSubcategory] IDB failed", e); }
      })();
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
      (async () => {
        try {
          const nodes = await getNodes(categoryId);
          const updated = nodes.map(n => n.name === oldName ? { ...n, name: newName } : n);
          await saveNodes(categoryId, updated);
        } catch (e) { console.error("[renameSubcategory] IDB failed", e); }
      })();
    },
    [setSubcategories, setCardMapState, cardMapRef],
  );

  const deleteSubcategory = useCallback(
    (categoryId: string, subcategory: string) => {
      setSubcategories((prev) => ({ ...prev, [categoryId]: (prev[categoryId] || []).filter((s) => s !== subcategory) }));
      // Non-destructive: move cards to uncategorized
      const now = Date.now();
      const changed: Card[] = [];
      const nextRef = { ...cardMapRef.current };
      for (const [id, c] of Object.entries(nextRef)) {
        if (c.categoryId === categoryId && c.subcategory === subcategory) {
          const u = { ...c, subcategory: "", chapter: "", updatedAt: now };
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
      (async () => {
        try {
          const nodes = await getNodes(categoryId);
          await saveNodes(categoryId, nodes.filter(n => n.name !== subcategory));
        } catch (e) { console.error("[deleteSubcategory] IDB failed", e); }
      })();
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

  // ═══════════════════════════════════════════════════════
  // Chapter CRUD — operates on SubcategoryNode.chapters
  // ═══════════════════════════════════════════════════════

  const addChapter = useCallback((categoryId: string, subName: string, chapterName: string) => {
    (async () => {
      try {
        const nodes = await getNodes(categoryId);
        const updated = nodes.map(n => {
          if (n.name !== subName) return n;
          if (n.chapters.includes(chapterName)) return n;
          return { ...n, chapters: [...n.chapters, chapterName] };
        });
        await saveNodes(categoryId, updated);
      } catch (e) { console.error("[addChapter] IDB failed", e); }
    })();
  }, []);

  const renameChapter = useCallback((categoryId: string, subName: string, oldChapter: string, newChapter: string) => {
    // Update cards
    const now = Date.now();
    const changed: Card[] = [];
    const nextRef = { ...cardMapRef.current };
    for (const [id, c] of Object.entries(nextRef)) {
      if (c.categoryId === categoryId && c.subcategory === subName && c.chapter === oldChapter) {
        const u = { ...c, chapter: newChapter, updatedAt: now };
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
    // Update node
    (async () => {
      try {
        const nodes = await getNodes(categoryId);
        const updated = nodes.map(n => {
          if (n.name !== subName) return n;
          return { ...n, chapters: n.chapters.map(ch => ch === oldChapter ? newChapter : ch) };
        });
        await saveNodes(categoryId, updated);
      } catch (e) { console.error("[renameChapter] IDB failed", e); }
    })();
  }, [setCardMapState, cardMapRef]);

  const deleteChapter = useCallback((categoryId: string, subName: string, chapterName: string) => {
    // Non-destructive: move cards to chapter=""
    const now = Date.now();
    const changed: Card[] = [];
    const nextRef = { ...cardMapRef.current };
    for (const [id, c] of Object.entries(nextRef)) {
      if (c.categoryId === categoryId && c.subcategory === subName && c.chapter === chapterName) {
        const u = { ...c, chapter: "", updatedAt: now };
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
    (async () => {
      try {
        const nodes = await getNodes(categoryId);
        const updated = nodes.map(n => {
          if (n.name !== subName) return n;
          return { ...n, chapters: n.chapters.filter(ch => ch !== chapterName) };
        });
        await saveNodes(categoryId, updated);
      } catch (e) { console.error("[deleteChapter] IDB failed", e); }
    })();
  }, [setCardMapState, cardMapRef]);

  const reorderSubcategories = useCallback((categoryId: string, ordered: string[]) => {
    setSubcategories((prev) => ({ ...prev, [categoryId]: ordered }));
    (async () => {
      try {
        const nodes = await getNodes(categoryId);
        const nodeMap = new Map(nodes.map(n => [n.name, n]));
        const reordered = ordered.map((name, i) => {
          const n = nodeMap.get(name);
          return n ? { ...n, sortOrder: i } : { name, chapters: [], sortOrder: i };
        });
        await saveNodes(categoryId, reordered);
      } catch (e) { console.error("[reorderSubcategories] IDB failed", e); }
    })();
  }, [setSubcategories]);

  const reorderChapters = useCallback((categoryId: string, subName: string, ordered: string[]) => {
    (async () => {
      try {
        const nodes = await getNodes(categoryId);
        const updated = nodes.map(n => {
          if (n.name !== subName) return n;
          return { ...n, chapters: ordered };
        });
        await saveNodes(categoryId, updated);
      } catch (e) { console.error("[reorderChapters] IDB failed", e); }
    })();
  }, []);

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
  };
}
