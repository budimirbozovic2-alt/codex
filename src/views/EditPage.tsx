import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";

export default function EditPage() {
  const { categories, subcategories, updateCard, setView, editingCard, setEditingCard } = useAppContext();

  return (
    <ErrorBoundary label="Uredi karticu" onNavigateHome={() => setView("dashboard")}>
      <CardForm
        categories={categories}
        subcategories={subcategories}
        onSave={() => {}}
        onSaveFlash={() => {}}
        onCancel={() => { setView("cards"); setEditingCard(null); }}
        editCard={editingCard}
        onUpdate={(id, u) => { updateCard(id, u); setEditingCard(null); setView("cards"); }}
      />
    </ErrorBoundary>
  );
}
