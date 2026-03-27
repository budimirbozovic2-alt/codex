import { useCallback } from "react";
import { Card } from "@/lib/spaced-repetition";
import { CardMap, bumpMapVersion, schedulePersist } from "@/lib/persist-queue";

interface UseCategoryManagementParams {
  categories: string[];
  setCategories: (updater: (prev: string[]) => string[]) => void;
  setSubcategories: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setCardMap: (updater: (prev: CardMap) => CardMap, persist?: "surgical" | "full") => void;
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
}

export function useCategoryManagement({
  categories,
  setCategories,
  setSubcategories,
  setCardMap,
  setCardMapState,
}: UseCategoryManagementParams) {
  const addCategory = useCallback(
    (name: string) => {
      setCategories((prev) => prev.includes(name) ? prev : [...prev, name]);
    },
    [setCategories],
  );

  const renameCategory = useCallback(
    (oldName: string, newName: string) => {
      if (categories.includes(newName)) return; // Synchronous check — no React 18 batching race
      setCategories(prev => prev.map(c => c === oldName ? newName : c));
      const changed: Card[] = [];
      setCardMapState((prev) => {
        const next = { ...prev };
        for (const [id, c] of Object.entries(next)) {
          if (c.category === oldName) {
            const u = { ...c, category: newName, updatedAt: Date.now() };
            next[id] = u;
            changed.push(u);
          }
        }
        return next;
      });
      if (changed.length > 0) schedulePersist({ type: "bulk", cards: changed });
      bumpMapVersion();
      setSubcategories((prev) => {
        const next = { ...prev };
        if (next[oldName]) { next[newName] = next[oldName]; delete next[oldName]; }
        return next;
      });
    },
    [categories, setCategories, setCardMapState, setSubcategories],
  );

  const deleteCategory = useCallback(
    (name: string) => {
      setCategories((prev) => prev.filter((c) => c !== name));
      const changed: Card[] = [];
      setCardMapState((prev) => {
        const next = { ...prev };
        for (const [id, c] of Object.entries(next)) {
          if (c.category === name) {
            const u = { ...c, category: "Opšte", subcategory: "", updatedAt: Date.now() };
            next[id] = u;
            changed.push(u);
          }
        }
        return next;
      });
      if (changed.length > 0) schedulePersist({ type: "bulk", cards: changed });
      bumpMapVersion();
      setSubcategories((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    },
    [setCategories, setCardMapState, setSubcategories],
  );

  const addSubcategory = useCallback(
    (category: string, subcategory: string) => {
      setSubcategories((prev) => {
        const list = prev[category] || [];
        if (list.includes(subcategory)) return prev;
        return { ...prev, [category]: [...list, subcategory] };
      });
    },
    [setSubcategories],
  );

  const renameSubcategory = useCallback(
    (category: string, oldName: string, newName: string) => {
      setSubcategories((prev) => {
        const list = prev[category] || [];
        if (list.includes(newName)) return prev;
        return { ...prev, [category]: list.map((s) => (s === oldName ? newName : s)) };
      });
      const changed: Card[] = [];
      setCardMapState((prev) => {
        const next = { ...prev };
        for (const [id, c] of Object.entries(next)) {
          if (c.category === category && c.subcategory === oldName) {
            const u = { ...c, subcategory: newName, updatedAt: Date.now() };
            next[id] = u;
            changed.push(u);
          }
        }
        return next;
      });
      if (changed.length > 0) schedulePersist({ type: "bulk", cards: changed });
      bumpMapVersion();
    },
    [setSubcategories, setCardMapState],
  );

  const deleteSubcategory = useCallback(
    (category: string, subcategory: string) => {
      setSubcategories((prev) => ({ ...prev, [category]: (prev[category] || []).filter((s) => s !== subcategory) }));
      const changed: Card[] = [];
      setCardMapState((prev) => {
        const next = { ...prev };
        for (const [id, c] of Object.entries(next)) {
          if (c.category === category && c.subcategory === subcategory) {
            const u = { ...c, subcategory: "", updatedAt: Date.now() };
            next[id] = u;
            changed.push(u);
          }
        }
        return next;
      });
      if (changed.length > 0) schedulePersist({ type: "bulk", cards: changed });
      bumpMapVersion();
    },
    [setSubcategories, setCardMapState],
  );

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategory: string) => {
    const changed: Card[] = [];
    setCardMapState((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (next[id]) {
          const u = { ...next[id], subcategory, updatedAt: Date.now() };
          next[id] = u;
          changed.push(u);
        }
      }
      return next;
    });
    if (changed.length > 0) schedulePersist({ type: "bulk", cards: changed });
    bumpMapVersion();
  }, [setCardMapState]);

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
