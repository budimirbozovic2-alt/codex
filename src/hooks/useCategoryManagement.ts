import { useCallback } from "react";
import { Card } from "@/lib/spaced-repetition";

type CardMap = Record<string, Card>;

interface UseCategoryManagementParams {
  categories: string[];
  setCategories: (updater: (prev: string[]) => string[]) => void;
  setSubcategories: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setCardMap: (updater: (prev: CardMap) => CardMap, persist?: "surgical" | "full") => void;
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  schedulePersist: (action: { type: "bulk"; cards: Card[] }) => void;
}

export function useCategoryManagement({
  categories,
  setCategories,
  setSubcategories,
  setCardMap,
  setCardMapState,
  schedulePersist,
}: UseCategoryManagementParams) {
  const addCategory = useCallback(
    (name: string) => {
      if (!categories.includes(name)) setCategories((prev) => [...prev, name]);
    },
    [categories, setCategories],
  );

  const renameCategory = useCallback(
    (oldName: string, newName: string) => {
      if (categories.includes(newName)) return;
      setCategories((prev) => prev.map((c) => (c === oldName ? newName : c)));
      setCardMap((prev) => {
        const next: CardMap = {};
        for (const [id, c] of Object.entries(prev)) {
          next[id] = c.category === oldName ? { ...c, category: newName } : c;
        }
        return next;
      }, "full");
      setSubcategories((prev) => {
        const next = { ...prev };
        if (next[oldName]) {
          next[newName] = next[oldName];
          delete next[oldName];
        }
        return next;
      });
    },
    [categories, setCategories, setCardMap, setSubcategories],
  );

  const deleteCategory = useCallback(
    (name: string) => {
      setCategories((prev) => prev.filter((c) => c !== name));
      setCardMap((prev) => {
        const next: CardMap = {};
        for (const [id, c] of Object.entries(prev)) {
          next[id] = c.category === name ? { ...c, category: "Opšte", subcategory: "" } : c;
        }
        return next;
      }, "full");
      setSubcategories((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    },
    [setCategories, setCardMap, setSubcategories],
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
      setCardMap((prev) => {
        const next: CardMap = {};
        for (const [id, c] of Object.entries(prev)) {
          next[id] = c.category === category && c.subcategory === oldName ? { ...c, subcategory: newName } : c;
        }
        return next;
      }, "full");
    },
    [setSubcategories, setCardMap],
  );

  const deleteSubcategory = useCallback(
    (category: string, subcategory: string) => {
      setSubcategories((prev) => ({ ...prev, [category]: (prev[category] || []).filter((s) => s !== subcategory) }));
      setCardMap((prev) => {
        const next: CardMap = {};
        for (const [id, c] of Object.entries(prev)) {
          next[id] = c.category === category && c.subcategory === subcategory ? { ...c, subcategory: "" } : c;
        }
        return next;
      }, "full");
    },
    [setSubcategories, setCardMap],
  );

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategory: string) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      const updated: Card[] = [];
      for (const id of ids) {
        if (next[id]) {
          next[id] = { ...next[id], subcategory };
          updated.push(next[id]);
        }
      }
      schedulePersist({ type: "bulk", cards: updated });
      return next;
    });
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
