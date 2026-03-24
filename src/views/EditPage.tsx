import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";
import { useEffect, useRef } from "react";

export default function EditPage() {
  const { categories, subcategories, updateCard } = useCardContext();
  const { setView, editingCard, setEditingCard } = useUIContext();
  const previousViewRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("sr-edit-return-view");
    if (stored) previousViewRef.current = stored;
  }, []);

  const handleCancel = () => {
    const returnTo = previousViewRef.current || "cards";
    setEditingCard(null);
    sessionStorage.removeItem("sr-edit-return-view");
    setView(returnTo as any);
  };

  const handleUpdate = (id: string, u: any) => {
    updateCard(id, u);
    setEditingCard(null);
    const returnTo = previousViewRef.current || "cards";
    sessionStorage.removeItem("sr-edit-return-view");
    setView(returnTo as any);
  };

  return (
    <ErrorBoundary label="Uredi karticu" onNavigateHome={() => setView("dashboard")}>
      <CardForm
        categories={categories}
        subcategories={subcategories}
        onSave={() => {}}
        onSaveFlash={() => {}}
        onCancel={handleCancel}
        editCard={editingCard}
        onUpdate={handleUpdate}
      />
    </ErrorBoundary>
  );
}
