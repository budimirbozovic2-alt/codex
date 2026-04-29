import { useCategoryData, useCardActions, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";
import { useEffect, useRef, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { Card } from "@/lib/spaced-repetition";
import { consumeEditReturn } from "@/lib/edit-return";

export default function EditPage() {
  const { categories, subcategories, categoryRecords } = useCategoryData();
  const { updateCard, splitCard } = useCardActions();
  const { setView, editingCard, setEditingCard } = useUIContext();
  const navigate = useNavigate();
  /** Absolute path to return to after save/cancel; resolved on mount. */
  const returnPathRef = useRef<string | null>(null);

  useEffect(() => {
    const ctx = consumeEditReturn();
    if (ctx?.path) returnPathRef.current = ctx.path;
  }, []);

  const navigateBack = useCallback(() => {
    const path = returnPathRef.current;
    if (path) {
      navigate(path);
      return;
    }
    setView("dashboard"); // safe fallback when no caller stashed a return
  }, [navigate, setView]);

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
