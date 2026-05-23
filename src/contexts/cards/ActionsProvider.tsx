import { useMemo, type ReactNode } from "react";
import { useCardCRUD } from "@/hooks/useCardCRUD";
import { useCardAnnotations } from "@/hooks/useCardAnnotations";
import { useCategoryManagement } from "@/hooks/useCategoryManagement";
import { useCardExport } from "@/hooks/useCardExport";
import { useCardImport } from "@/hooks/useCardImport";
import { useCardStateInternals, useCardData, useReviewData } from "./CardStateProvider";
import { useCategoryStateInternals } from "./CategoryStateProvider";
import {
  CardActionsContext,
  CategoryActionsContext,
  BackupActionsContext,
  type CardActionsValue,
  type CategoryActionsValue,
  type BackupActionsValue,
} from "./actions-contexts";

/**
 * Spojeni provider za sve action surface-e (card / category / backup).
 * Ranije su bila 3 ugnijezdjena providera; sada je jedan komponentni node
 * sa 3 nested Context.Provider-a iznutra — javni `useCardOnlyActions /
 * useCategoryActions / useBackupActions` ostaju identično ponašanje.
 */
export function ActionsProvider({ children }: { children: ReactNode }) {
  const { setCardMapState, setReviewLog, replaceReviewLog, updateSRSettings } = useCardStateInternals();
  const { setCategoryRecords, getCategoryRecords } = useCategoryStateInternals();
  const { cards } = useCardData();
  const { srSettings } = useReviewData();

  // ─── Card actions ───
  const crud = useCardCRUD({ setCardMapState });
  const annotations = useCardAnnotations({
    patchCard: crud.patchCard, setCardMapState, setReviewLog,
  });
  const cardActions = useMemo<CardActionsValue>(
    () => ({ ...crud, ...annotations }),
    [
      crud.patchCard, crud.addCard, crud.addFlashCard, crud.updateCard,
      crud.deleteCard, crud.splitCard, crud.bulkAddCards, crud.bulkAddFlashCards, crud.setFrequency,
      annotations.reviewSection, annotations.markRead, annotations.toggleTag,
      annotations.logError, annotations.clearErrorLog, annotations.addKeyPart,
      annotations.bulkFlagNeedsReview, annotations.bulkUpdateChapter,
    ],
  );

  // ─── Category actions ───
  const categoryActionsRaw = useCategoryManagement({
    setCategoryRecords, setCardMapState, getCategoryRecords,
  });
  const categoryActions = useMemo<CategoryActionsValue>(
    () => categoryActionsRaw,
    [
      categoryActionsRaw.addCategory, categoryActionsRaw.renameCategory, categoryActionsRaw.deleteCategory,
      categoryActionsRaw.addSubcategory, categoryActionsRaw.renameSubcategory, categoryActionsRaw.deleteSubcategory,
      categoryActionsRaw.bulkUpdateSubcategory,
      categoryActionsRaw.addChapter, categoryActionsRaw.renameChapter, categoryActionsRaw.deleteChapter,
      categoryActionsRaw.reorderSubcategories, categoryActionsRaw.reorderChapters, categoryActionsRaw.reorderCategories,
      categoryActionsRaw.updateExaminerProfile,
    ],
  );

  // ─── Backup actions ───
  const exportApi = useCardExport({ cards, srSettings });
  const importApi = useCardImport({
    setCategoryRecords, setReviewLog: replaceReviewLog, updateSRSettings, setCardMapState,
  });
  const backupActions = useMemo<BackupActionsValue>(
    () => ({ ...exportApi, ...importApi }),
    [exportApi.exportData, exportApi.exportTemplate, importApi.importData, importApi.importCards],
  );

  return (
    <CardActionsContext.Provider value={cardActions}>
      <CategoryActionsContext.Provider value={categoryActions}>
        <BackupActionsContext.Provider value={backupActions}>
          {children}
        </BackupActionsContext.Provider>
      </CategoryActionsContext.Provider>
    </CardActionsContext.Provider>
  );
}
