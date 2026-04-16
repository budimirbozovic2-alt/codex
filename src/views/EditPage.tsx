import { useCategoryData, useCardActions, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";
import { useEffect, useRef, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { Card } from "@/lib/spaced-repetition";
import type { View } from "@/contexts/AppContext";

export default function EditPage() {
  const { categories, subcategories, categoryRecords } = useCategoryData();
  const { updateCard, splitCard } = useCardActions();
  const { setView, editingCard, setEditingCard } = useUIContext();
  const navigate = useNavigate();
  const previousViewRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("sr-edit-return-view");
    if (stored) previousViewRef.current = stored;
  }, []);

  const navigateBack = useCallback(() => {
    const returnTo = previousViewRef.current || "dashboard";
    sessionStorage.removeItem("sr-edit-return-view");
    if (returnTo.startsWith("category:")) {
      const catId = returnTo.slice("category:".length);
      navigate(`/category/${catId}`);
    } else {
      setView(returnTo as View);
    }
  }, [setView, navigate]);

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
