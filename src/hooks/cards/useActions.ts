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
import { useReviewData } from "./useCardState";
import type {
  CardActionsValue,
  CategoryActionsValue,
  BackupActionsValue,
} from "./action-types";

export function useCardOnlyActions(): CardActionsValue {
  const crud = useCardCRUD();
  const annotations = useCardAnnotations();
  return useMemo(
    () => ({ ...crud, ...annotations }),
    // Spreads above pull in all keys; granular deps below memoize on the
    // stable function refs from each hook. Listing the parent objects would
    // recreate on every render — these are intentional fine-grained deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Granular method deps — see useCardOnlyActions rationale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const { srSettings } = useReviewData();
  const exportApi = useCardExport({ srSettings });
  const importApi = useCardImport();
  return useMemo(
    () => ({ ...exportApi, ...importApi }),
    // Granular method deps — see useCardOnlyActions rationale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exportApi.exportData, exportApi.exportTemplate, importApi.importData, importApi.importCards],
  );
}
