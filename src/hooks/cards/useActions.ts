/**
 * Provider Cleanup v2 — Action hooks compose underlying hooks directly,
 * no React Context. All writes flow through repositories which are
 * themselves Zustand-backed, so consumers re-render through the existing
 * store subscriptions (useCardData / useCategoryData) instead of through
 * a separate Context lookup.
 */
import { useMemo } from "react";
import { useCardCRUD } from "@/hooks/useCardCRUD";
import { useCardAnnotations } from "@/hooks/useCardAnnotations";
import { useCategoryManagement } from "@/hooks/useCategoryManagement";
import { useCardExport } from "@/hooks/useCardExport";
import { useCardImport } from "@/hooks/useCardImport";
import { useCardData, useReviewData } from "./useCardState";
import type {
  CardActionsValue,
  CategoryActionsValue,
  BackupActionsValue,
} from "./action-types";

export function useCardOnlyActions(): CardActionsValue {
  const crud = useCardCRUD();
  const annotations = useCardAnnotations({ patchCard: crud.patchCard });
  return useMemo(
    () => ({ ...crud, ...annotations }),
    [
      crud.patchCard, crud.addCard, crud.addFlashCard, crud.updateCard,
      crud.deleteCard, crud.splitCard, crud.bulkAddCards, crud.bulkAddFlashCards, crud.setFrequency,
      annotations.reviewSection, annotations.markRead, annotations.toggleTag,
      annotations.logError, annotations.clearErrorLog, annotations.addKeyPart,
      annotations.bulkFlagNeedsReview, annotations.bulkUpdateChapter,
    ],
  );
}

export function useCategoryActions(): CategoryActionsValue {
  const actions = useCategoryManagement();
  return useMemo(
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
}

export function useBackupActions(): BackupActionsValue {
  const { cards } = useCardData();
  const { srSettings } = useReviewData();
  const exportApi = useCardExport({ cards, srSettings });
  const importApi = useCardImport();
  return useMemo(
    () => ({ ...exportApi, ...importApi }),
    [exportApi.exportData, exportApi.exportTemplate, importApi.importData, importApi.importCards],
  );
}
