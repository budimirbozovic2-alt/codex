import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCategoryManagement } from "@/hooks/useCategoryManagement";
import { useCardStateInternals } from "./CardStateProvider";
import { useCategoryStateInternals } from "./CategoryStateProvider";

export type CategoryActionsValue = ReturnType<typeof useCategoryManagement>;

const CategoryActionsContext = createContext<CategoryActionsValue | null>(null);

export function useCategoryActions() {
  const ctx = useContext(CategoryActionsContext);
  if (!ctx) throw new Error("useCategoryActions must be used within CategoryActionsProvider");
  return ctx;
}

export function CategoryActionsProvider({ children }: { children: ReactNode }) {
  const { setCardMapState, cardMapRef } = useCardStateInternals();
  const { setCategoryRecords, getCategoryRecords } = useCategoryStateInternals();

  const actions = useCategoryManagement({
    setCategoryRecords, setCardMapState, cardMapRef, getCategoryRecords,
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
