import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCategoryManagement } from "@/hooks/useCategoryManagement";
import { useCardStateInternals } from "./CardStateProvider";
import { useCategoryStateInternals } from "./CategoryStateProvider";

export type CategoryActionsValue = ReturnType<typeof useCategoryManagement>;

const CategoryActionsContext = createContext<CategoryActionsValue | null>(null);

const noop = () => { /* HMR fallback */ };
const NOOP_CATEGORY_ACTIONS = new Proxy({} as CategoryActionsValue, { get: () => noop });

export function useCategoryActions() {
  const ctx = useContext(CategoryActionsContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn("[useCategoryActions] no provider — returning noop fallback (HMR transient)");
      return NOOP_CATEGORY_ACTIONS;
    }
    throw new Error("useCategoryActions must be used within CategoryActionsProvider");
  }
  return ctx;
}

export function CategoryActionsProvider({ children }: { children: ReactNode }) {
  const { setCardMapState } = useCardStateInternals();
  const { setCategoryRecords, getCategoryRecords } = useCategoryStateInternals();

  const actions = useCategoryManagement({
    setCategoryRecords, setCardMapState, getCategoryRecords,
  });

  const value = useMemo<CategoryActionsValue>(
    () => actions,
    [
      actions.addCategory, actions.renameCategory, actions.deleteCategory,
      actions.addSubcategory, actions.renameSubcategory, actions.deleteSubcategory,
      actions.bulkUpdateSubcategory,
      actions.addChapter, actions.renameChapter, actions.deleteChapter,
      actions.reorderSubcategories, actions.reorderChapters, actions.reorderCategories,
      actions.updateExaminerProfile,
    ],
  );

  return (
    <CategoryActionsContext.Provider value={value}>
      {children}
    </CategoryActionsContext.Provider>
  );
}
