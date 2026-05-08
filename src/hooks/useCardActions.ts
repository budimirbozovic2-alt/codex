import { useCallback, useMemo } from "react";
import type { CategoryRecord } from "@/lib/db";
import { Card, FrequencyTag, CardSourceType } from "@/lib/spaced-repetition";
import { toast } from "sonner";
import type { CardDraftSnapshot } from "./useCardDraftAutosave";
import { useSectionEditor } from "./card-actions/useSectionEditor";
import { useCardMetadata } from "./card-actions/useCardMetadata";
import { useCardDraft } from "./card-actions/useCardDraft";
import { validate, parseHtmlToParagraphs } from "./card-actions/validation";

// Re-exports for back-compat with existing consumers.
export type { SectionInput, CardType, FormWidth, ValidationErrors } from "./card-actions/validation";
export { parseHtmlToParagraphs };

interface UseCardActionsProps {
  categories: string[];
  subcategories: Record<string, string[]>;
  categoryRecords?: CategoryRecord[];
  editCard?: Card | null;
  onSave: (question: string, sections: { title: string; content: string }[], categoryId: string, subcategoryId?: string, chapterId?: string) => void;
  onSaveFlash: (question: string, answer: string, categoryId: string, subcategoryId?: string) => void;
  onUpdate?: (id: string, updates: {
    question?: string;
    sections?: { title: string; content: string }[];
    categoryId?: string;
    subcategoryId?: string;
    chapterId?: string;
    frequencyTag?: FrequencyTag;
    sourceType?: CardSourceType;
  }) => void;
}

export function useCardActions({ categories, categoryRecords, editCard, onSave, onSaveFlash, onUpdate }: UseCardActionsProps) {
  const editor = useSectionEditor(editCard);
  const meta = useCardMetadata({ categories, categoryRecords, editCard });

  const draftSnapshot: CardDraftSnapshot = useMemo(() => ({
    cardType: editor.cardType,
    question: editor.question,
    flashAnswer: editor.flashAnswer,
    sections: editor.sections,
    categoryId: meta.categoryId,
    subcategoryId: meta.subcategoryId,
    chapterId: meta.chapterId,
    frequencyTag: meta.frequencyTag,
    sourceType: meta.sourceType,
  }), [
    editor.cardType, editor.question, editor.flashAnswer, editor.sections,
    meta.categoryId, meta.subcategoryId, meta.chapterId, meta.frequencyTag, meta.sourceType,
  ]);

  const applyDraft = useCallback((d: CardDraftSnapshot) => {
    editor.setCardType(d.cardType);
    editor.setQuestion(d.question);
    editor.setFlashAnswer(d.flashAnswer);
    editor.setSections(d.sections.length > 0 ? d.sections : [{ title: "Cjelina 1", content: "" }]);
    meta.setCategoryId(d.categoryId);
    meta.setSubcategoryId(d.subcategoryId);
    meta.setChapterId(d.chapterId);
    meta.setFrequencyTag(d.frequencyTag);
    meta.setSourceType(d.sourceType);
  }, [editor, meta]);

  const draft = useCardDraft({
    editCardId: editCard?.id,
    initialCategoryId: editCard?.categoryId ?? categories[0] ?? "",
    draftSnapshot,
    applyDraft,
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    const errors = validate(editor.cardType, editor.question, editor.flashAnswer, editor.sections);
    editor.setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      toast.error(firstError);
      return;
    }

    editor.setIsSaving(true);
    const { categoryId: cat, subcategoryId: sub, chapterId: ch } = meta.resolvedMeta;

    try {
      if (editor.cardType === "flash") {
        if (editCard && onUpdate) {
          onUpdate(editCard.id, {
            question: editor.question,
            sections: [{ title: "Odgovor", content: editor.flashAnswer }],
            categoryId: cat, subcategoryId: sub, chapterId: ch,
            ...(meta.frequencyTag ? { frequencyTag: meta.frequencyTag as FrequencyTag } : {}),
            ...(meta.sourceType ? { sourceType: meta.sourceType as CardSourceType } : {}),
          });
        } else {
          onSaveFlash(editor.question, editor.flashAnswer, cat, sub);
        }
      } else {
        if (editCard && onUpdate) {
          onUpdate(editCard.id, {
            question: editor.question,
            sections: editor.sections,
            categoryId: cat, subcategoryId: sub, chapterId: ch,
            ...(meta.frequencyTag ? { frequencyTag: meta.frequencyTag as FrequencyTag } : {}),
            ...(meta.sourceType ? { sourceType: meta.sourceType as CardSourceType } : {}),
          });
        } else {
          onSave(editor.question, editor.sections, cat, sub, ch);
        }
      }
      draft.clearDraft();
    } finally {
      editor.setIsSaving(false);
    }
  }, [editor, meta, editCard, onSave, onSaveFlash, onUpdate, draft]);

  return {
    // Editor state
    cardType: editor.cardType,
    question: editor.question,
    flashAnswer: editor.flashAnswer,
    sections: editor.sections,
    cuttingIndex: editor.cuttingIndex,
    validationErrors: editor.validationErrors,
    isSaving: editor.isSaving,
    // Metadata state
    categoryId: meta.categoryId,
    subcategoryId: meta.subcategoryId,
    chapterId: meta.chapterId,
    newCategory: meta.newCategory,
    showNewCat: meta.showNewCat,
    newSubcategory: meta.newSubcategory,
    showNewSub: meta.showNewSub,
    newChapter: meta.newChapter,
    showNewChapter: meta.showNewChapter,
    formWidth: meta.formWidth,
    frequencyTag: meta.frequencyTag,
    sourceType: meta.sourceType,
    availableSubs: meta.availableSubs,
    availableChapters: meta.availableChapters,
    linkedGazetteInfo: meta.linkedGazetteInfo,
    // Editor setters
    setCardType: editor.setCardType,
    setQuestion: editor.setQuestion,
    setFlashAnswer: editor.setFlashAnswer,
    setCuttingIndex: editor.setCuttingIndex,
    // Metadata setters
    setCategoryId: meta.setCategoryId,
    setSubcategoryId: meta.setSubcategoryId,
    setChapterId: meta.setChapterId,
    setNewCategory: meta.setNewCategory,
    setShowNewCat: meta.setShowNewCat,
    setNewSubcategory: meta.setNewSubcategory,
    setShowNewSub: meta.setShowNewSub,
    setNewChapter: meta.setNewChapter,
    setShowNewChapter: meta.setShowNewChapter,
    setFormWidth: meta.setFormWidth,
    setFrequencyTag: meta.setFrequencyTag,
    setSourceType: meta.setSourceType,
    // Editor actions
    addSection: editor.addSection,
    removeSection: editor.removeSection,
    updateSection: editor.updateSection,
    moveSection: editor.moveSection,
    handleCut: editor.handleCut,
    handleSubmit,
    // Draft autosave
    pendingDraft: draft.pendingDraft,
    pendingDraftSavedAt: draft.pendingDraftSavedAt,
    restoreDraft: draft.restoreDraft,
    dismissDraft: draft.dismissDraft,
  };
}
