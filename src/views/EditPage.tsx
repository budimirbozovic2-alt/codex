import { useCategoryData, useCardOnlyActions, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";
import { Navigate } from "react-router-dom";
import type { Card } from "@/lib/spaced-repetition";
import { useEditReturnTarget } from "@/hooks/useEditReturnTarget";

export default function EditPage() {
  const { categories, subcategories, categoryRecords } = useCategoryData();
  const { updateCard, splitCard } = useCardOnlyActions();
  const { setView, editingCard, setEditingCard } = useUIContext();
  const { navigateBack } = useEditReturnTarget();

  // R1: Guard — redirect if no card to edit
  if (!editingCard) {
    return <Navigate to="/" replace />;
  }

  const handleCancel = () => {
    setEditingCard(null);
    navigateBack();
  };

  const handleUpdate = (id: string, u: Partial<Card>) => {
    updateCard(id, u);
    setEditingCard(null);
    navigateBack();
  };

  const handleSplit = (id: string) => {
    splitCard(id);
    setEditingCard(null);
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
