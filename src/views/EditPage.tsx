import type React from "react";
import { useCardOnlyActions } from "@/hooks/cards/useActions";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useUIContext } from "@/hooks/useUI";
import { useCardById } from "@/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";
import { Navigate } from "react-router-dom";
import type { Card } from "@/lib/spaced-repetition";
import { useEditReturnTarget } from "@/hooks/useEditReturnTarget";

export default function EditPage() {
  const { categories, subcategories, categoryRecords } = useCategoryData();
  const { updateCard, splitCard } = useCardOnlyActions();
  const { setView, editingCardId, setEditingCardId } = useUIContext();
  const { navigateBack } = useEditReturnTarget();

  // Phase 1 — granular selector: re-renders only when THIS card changes,
  // not when any card in the entire library mutates.
  const editingCard = useCardById(editingCardId);

  if (!editingCard) {
    return <Navigate to="/" replace />;
  }

  const handleCancel = () => {
    setEditingCardId(null);
    navigateBack();
  };

  // PR-G7: narrow to CardForm's onUpdate signature (SectionInput[] is the
  // editor-shape, not Card['sections']). strictFunctionTypes (enabled with
  // strict:true) makes function params contravariant — using Partial<Card>
  // here would be wider than the prop expects and fail assignability.
  const handleUpdate: React.ComponentProps<typeof CardForm>["onUpdate"] = (id, u) => {
    void updateCard(id, u as Partial<Card>);
    setEditingCardId(null);
    navigateBack();
  };

  const handleSplit = (id: string) => {
    splitCard(id);
    setEditingCardId(null);
    navigateBack();
  };

  return (
    <ErrorBoundary label="Uredi karticu" onNavigateHome={() => setView("dashboard")}>
      <CardForm
        categories={categories}
        subcategories={subcategories}
        categoryRecords={categoryRecords}
        onSave={() => {}}
        onSaveFlash={() => {}}
        onCancel={handleCancel}
        editCard={editingCard}
        onUpdate={handleUpdate}
        onSplit={handleSplit}
      />
    </ErrorBoundary>
  );
}
