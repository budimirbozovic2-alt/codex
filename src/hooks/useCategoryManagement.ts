import { useCallback } from "react";
import { Card } from "@/lib/spaced-repetition";
import { CardMap, bumpMapVersion } from "@/lib/persist-queue";

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
      // Use functional updater to avoid stale closure on categories
      let didRename = false;
      setCategories((prev) => {
        if (prev.includes(newName)) return prev; // no-op if target exists
        didRename = true;
        return prev.map((c) => (c === oldName ? newName : c));
      });
      // React 18: updater runs synchronously in same event handler, so didRename is set
      if (!didRename) return;
      // Surgical: only update cards in the renamed category
      let updated: Card[] = [];
      setCardMapState((prev) => {
        const next = { ...prev };
        for (const [id, c] of Object.entries(next)) {
          if (c.category === oldName) {
            next[id] = { ...c, category: newName };
            updated.push(next[id]);
          }
        }
        return next;
      });
      bumpMapVersion();
      if (updated.length > 0) globalSchedulePersist({ type: "bulk", cards: updated });
      setSubcategories((prev) => {
        const next = { ...prev };
        if (next[oldName]) {
          next[newName] = next[oldName];
          delete next[oldName];
        }
        return next;
      });
    },
    [setCategories, setCardMapState, setSubcategories],
  );

  const deleteCategory = useCallback(
    (name: string) => {
      setCategories((prev) => prev.filter((c) => c !== name));
      // Surgical: only update cards in the deleted category
      let updated: Card[] = [];
      setCardMapState((prev) => {
        const next = { ...prev };
        for (const [id, c] of Object.entries(next)) {
          if (c.category === name) {
            next[id] = { ...c, category: "Opšte", subcategory: "" };
            updated.push(next[id]);
          }
        }
        return next;
      });
      bumpMapVersion();
      if (updated.length > 0) globalSchedulePersist({ type: "bulk", cards: updated });
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
      // Surgical: only update cards with the old subcategory
      let updated: Card[] = [];
      setCardMapState((prev) => {
        const next = { ...prev };
        for (const [id, c] of Object.entries(next)) {
          if (c.category === category && c.subcategory === oldName) {
            next[id] = { ...c, subcategory: newName };
            updated.push(next[id]);
          }
        }
        return next;
      });
      bumpMapVersion();
      if (updated.length > 0) globalSchedulePersist({ type: "bulk", cards: updated });
    },
    [setSubcategories, setCardMapState],
  );

  const deleteSubcategory = useCallback(
    (category: string, subcategory: string) => {
      setSubcategories((prev) => ({ ...prev, [category]: (prev[category] || []).filter((s) => s !== subcategory) }));
      // Surgical: only update cards with the deleted subcategory
      let updated: Card[] = [];
      setCardMapState((prev) => {
        const next = { ...prev };
        for (const [id, c] of Object.entries(next)) {
          if (c.category === category && c.subcategory === subcategory) {
            next[id] = { ...c, subcategory: "" };
            updated.push(next[id]);
          }
        }
        return next;
      });
      bumpMapVersion();
      if (updated.length > 0) globalSchedulePersist({ type: "bulk", cards: updated });
    },
    [setSubcategories, setCardMapState],
  );

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategory: string) => {
    let updated: Card[] = [];
    setCardMapState((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (next[id]) {
          next[id] = { ...next[id], subcategory };
          updated.push(next[id]);
        }
      }
      return next;
    });
    bumpMapVersion();
    if (updated.length > 0) schedulePersist({ type: "bulk", cards: updated });
  }, [setCardMapState, schedulePersist]);

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
