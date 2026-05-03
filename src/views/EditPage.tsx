import { useCategoryData, useCardData, useCardOnlyActions, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";
import { Navigate } from "react-router-dom";
import { useMemo } from "react";
import type { Card } from "@/lib/spaced-repetition";
import { useEditReturnTarget } from "@/hooks/useEditReturnTarget";

export default function EditPage() {
  const { categories, subcategories, categoryRecords } = useCategoryData();
  const { cards } = useCardData();
  const { updateCard, splitCard } = useCardOnlyActions();
  const { setView, editingCardId, setEditingCardId } = useUIContext();
  const { navigateBack } = useEditReturnTarget();

  // C3: Resolve live Card from cardMap each render — UIContext stores only the UUID.
  const editingCard = useMemo(
    () => (editingCardId ? cards.find((c) => c.id === editingCardId) ?? null : null),
    [cards, editingCardId],
  );

  if (!editingCard) {
    return <Navigate to="/" replace />;
  }

  const handleCancel = () => {
    setEditingCardId(null);
    navigateBack();
  };

  const handleUpdate = (id: string, u: Partial<Card>) => {
    updateCard(id, u);
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
