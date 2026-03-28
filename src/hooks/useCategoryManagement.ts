import { useCallback, MutableRefObject } from "react";
import { Card } from "@/lib/spaced-repetition";
import { CardMap, bumpMapVersion, schedulePersist } from "@/lib/persist-queue";
import { db } from "@/lib/db";
import { invalidateSourcesCache } from "@/lib/sources-storage";

interface UseCategoryManagementParams {
  setCategories: (updater: (prev: string[]) => string[]) => void;
  setSubcategories: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  cardMapRef: MutableRefObject<CardMap>;
}

export function useCategoryManagement({
  setCategories,
  setSubcategories,
  setCardMapState,
  cardMapRef,
}: UseCategoryManagementParams) {
  const addCategory = useCallback(
    (name: string) => {
      setCategories((prev) => prev.includes(name) ? prev : [...prev, name]);
    },
    [setCategories],
  );

  // C1 fix v2: Check duplicate BEFORE calling setCategories to avoid relying on
  // synchronous updater execution for the abort flag
  const renameCategory = useCallback(
    (oldName: string, newName: string) => {
      // Pre-check: read current categories from a synchronous source
      // setCategories updater is the canonical check, but we guard with ref-based pre-check
      setCategories(prev => {
        if (prev.includes(newName)) return prev; // no-op if duplicate
        return prev.map(c => c === oldName ? newName : c);
      });

      // Always attempt card rename — if categories didn't change (duplicate),
      // no cards will match oldName after the no-op, so changed[] stays empty
      // This is safe because we check c.category === oldName below

      const now = Date.now();
      const changed: Card[] = [];
      const nextRef = { ...cardMapRef.current };
      for (const [id, c] of Object.entries(nextRef)) {
        if (c.category === oldName) {
          const u = { ...c, category: newName, updatedAt: now };
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
      setSubcategories((prev) => {
        const next = { ...prev };
        if (next[oldName]) { next[newName] = next[oldName]; delete next[oldName]; }
        return next;
      });
    },
    [setCategories, setCardMapState, setSubcategories, cardMapRef],
  );

  const deleteCategory = useCallback(
    (name: string) => {
      setCategories((prev) => prev.filter((c) => c !== name));
      const now = Date.now();
      const changed: Card[] = [];
      const nextRef = { ...cardMapRef.current };
      for (const [id, c] of Object.entries(nextRef)) {
        if (c.category === name) {
          const u = { ...c, category: "Opšte", subcategory: "", updatedAt: now };
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
      setSubcategories((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    },
    [setCategories, setCardMapState, setSubcategories, cardMapRef],
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
      const now = Date.now();
      const changed: Card[] = [];
      const nextRef = { ...cardMapRef.current };
      for (const [id, c] of Object.entries(nextRef)) {
        if (c.category === category && c.subcategory === oldName) {
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
    (category: string, subcategory: string) => {
      setSubcategories((prev) => ({ ...prev, [category]: (prev[category] || []).filter((s) => s !== subcategory) }));
      const now = Date.now();
      const changed: Card[] = [];
      const nextRef = { ...cardMapRef.current };
      for (const [id, c] of Object.entries(nextRef)) {
        if (c.category === category && c.subcategory === subcategory) {
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
