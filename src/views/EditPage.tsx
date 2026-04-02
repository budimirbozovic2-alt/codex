import { useCategoryData, useCardActions, useUIContext, type View } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";
import { useEffect, useRef, useCallback } from "react";
import type { Card } from "@/lib/spaced-repetition";

export default function EditPage() {
  const { categories, subcategories, categoryRecords, updateCard, splitCard } = useCardContext();
  const { setView, editingCard, setEditingCard } = useUIContext();
  const previousViewRef = useRef<View | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("sr-edit-return-view");
    if (stored) previousViewRef.current = stored as View;
  }, []);

  const navigateBack = useCallback(() => {
    const returnTo = previousViewRef.current || "dashboard";
    sessionStorage.removeItem("sr-edit-return-view");
    if (returnTo.startsWith("category:")) {
      const catId = returnTo.slice("category:".length);
      window.location.hash = `#/category/${catId}`;
    } else {
      setView(returnTo);
    }
  }, [setView]);

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
